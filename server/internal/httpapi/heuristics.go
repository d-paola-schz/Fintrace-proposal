package httpapi

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/preflight/preflight/server/internal/ai"
	"github.com/preflight/preflight/server/internal/finance"
)

// The heuristic router keeps the whole product usable with no model configured
// at all. It only ever reads values the question actually states; anything it
// cannot find stays zero so the caller asks for it.

var (
	amountRe   = regexp.MustCompile(`(?i)\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(k\b)?|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(k\b)?\s*(?:dollars|usd)`)
	isoDateRe  = regexp.MustCompile(`\b(\d{4}-\d{2}-\d{2})\b`)
	monthDayRe = regexp.MustCompile(`(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b`)
	inDaysRe   = regexp.MustCompile(`(?i)\bin\s+(\d{1,2})\s+days?\b`)
	delayRe    = regexp.MustCompile(`(?i)\b(\d{1,2})\s*(?:day|days)\s*(?:late|later|delay|delayed)?\b`)
)

var months = map[string]time.Month{
	"jan": time.January, "feb": time.February, "mar": time.March, "apr": time.April,
	"may": time.May, "jun": time.June, "jul": time.July, "aug": time.August,
	"sep": time.September, "oct": time.October, "nov": time.November, "dec": time.December,
}

// domainVocabulary is the closed set of words that make a question plausibly
// about this workspace. The two generic fallbacks below (an open node, or no
// match at all) may only claim a question when it contains at least one of
// these — otherwise a question with nothing to do with cash, sales or the
// selected node (e.g. "what's the weather?") would silently be answered as if
// it were about whatever node happened to be open.
var domainVocabulary = []string{
	"cash", "balance", "reserve", "spend", "spending", "invest", "investment",
	"afford", "buy", "payout", "supplier", "rent", "ad", "ads", "campaign",
	"marketing", "sale", "sales", "revenue", "order", "orders", "item", "items",
	"business", "doing", "health", "summary", "overview", "node", "chain",
	"evidence", "source", "sources", "margin", "profit", "stock", "inventory",
	"reorder", "restock", "unit", "units", "delay", "delayed", "late",
	"projection", "scenario", "alternative", "compare", "instead", "proposal",
	"expenditure", "purchase", "money", "dollar", "dollars", "price", "cost",
	"timeline", "chart", "breach", "shortfall", "gap",
}

func inDomain(l string) bool { return containsAny(l, domainVocabulary...) }

// isShortFollowUp treats a short question ("why?", "explain this", "tell me
// more") as belonging to whatever node is already open, since it plainly
// isn't standing on its own. A longer question gets no such benefit of the
// doubt — it must actually mention the domain.
func isShortFollowUp(q string) bool {
	return len(strings.Fields(strings.TrimSpace(q))) <= 3
}

func heuristicIntent(q, nodeID string) ai.Intent {
	l := strings.ToLower(q)
	switch {
	case containsAny(l, "can i spend", "could i spend", "should i spend", "can i invest",
		"afford", "can i buy", "invest in", "spend $", "put $"):
		return ai.IntentProposeSpend
	case containsAny(l, "where does", "where did", "which source", "what source",
		"evidence", "how do you know", "prove", "come from"):
		return ai.IntentEvidence
	case containsAny(l, "why is cash", "cash tight", "cash gap", "shortfall",
		"run out", "below my reserve", "breach", "what if the payout", "payout late",
		"payout is delayed", "delay", "days late", "is late", "arrives late",
		"lands late", "comes late"):
		return ai.IntentExplainCash
	case containsAny(l, "lowest", "projection", "alternative", "compare", "instead",
		"scenario", "what happens if"):
		return ai.IntentScenarioResult
	case containsAny(l, "margin", "profit", "stock", "inventory", "units left",
		"reorder", "how many units"):
		// These are answerable only as "not in the connected records", which the
		// node explanation already states.
		if nodeID != "" {
			return ai.IntentExplainNode
		}
		return ai.IntentCompanySummary
	case nodeID != "" && (inDomain(l) || isShortFollowUp(q)):
		return ai.IntentExplainNode
	case containsAny(l, "how is", "how are", "doing", "summary", "overview", "health"):
		return ai.IntentCompanySummary
	case inDomain(l):
		return ai.IntentCompanySummary
	}
	return ai.IntentUnsupported
}

func containsAny(s string, subs ...string) bool {
	for _, x := range subs {
		if strings.Contains(s, x) {
			return true
		}
	}
	return false
}

// heuristicExtract reads only what the sentence states.
func heuristicExtract(q string) ai.Extraction {
	var e ai.Extraction
	e.AmountCents = parseAmountCents(q)
	e.Date = parseDate(q, time.Now())
	if m := delayRe.FindStringSubmatch(q); len(m) == 2 {
		if strings.Contains(strings.ToLower(q), "late") || strings.Contains(strings.ToLower(q), "delay") {
			if n, err := strconv.Atoi(m[1]); err == nil && n > 0 && n <= 60 {
				e.PayoutDelayDays = n
			}
		}
	}
	l := strings.ToLower(q)
	switch {
	case containsAny(l, "ad", "ads", "advertis", "campaign", "marketing"):
		e.Category, e.Description = "marketing", "Ad spend"
	case containsAny(l, "stock", "inventory", "reorder", "restock", "units"):
		e.Category, e.Description = "inventory", "Inventory purchase"
	case containsAny(l, "equipment", "machine", "printer", "van"):
		e.Category, e.Description = "equipment", "Equipment purchase"
	default:
		e.Category, e.Description = "other", "Proposed expenditure"
	}
	return e
}

func parseAmountCents(q string) int64 {
	m := amountRe.FindStringSubmatch(q)
	if m == nil {
		return 0
	}
	raw, k := m[1], m[2]
	if raw == "" {
		raw, k = m[3], m[4]
	}
	if raw == "" {
		return 0
	}
	raw = strings.ReplaceAll(raw, ",", "")
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil || f <= 0 {
		return 0
	}
	if k != "" {
		f *= 1000
	}
	return int64(f*100 + 0.5)
}

// parseDate resolves only explicitly stated dates. "End of the month" is a
// stated date and is resolved; anything vaguer returns "".
func parseDate(q string, now time.Time) string {
	if m := isoDateRe.FindStringSubmatch(q); len(m) == 2 {
		if _, err := finance.ParseDate(m[1]); err == nil {
			return m[1]
		}
	}
	today := finance.Day(now)
	if m := inDaysRe.FindStringSubmatch(q); len(m) == 2 {
		if n, err := strconv.Atoi(m[1]); err == nil && n >= 0 {
			return today.AddDate(0, 0, n).Format(finance.DateLayout)
		}
	}
	if m := monthDayRe.FindStringSubmatch(q); len(m) == 3 {
		mon, ok := months[strings.ToLower(m[1])[:3]]
		day, err := strconv.Atoi(m[2])
		if ok && err == nil && day >= 1 && day <= 31 {
			year := today.Year()
			d := time.Date(year, mon, day, 0, 0, 0, 0, time.UTC)
			if d.Before(today) {
				d = d.AddDate(1, 0, 0)
			}
			return d.Format(finance.DateLayout)
		}
	}
	l := strings.ToLower(q)
	if containsAny(l, "end of the month", "end of month", "month end", "month-end",
		"before the month is out", "by month end") {
		first := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, time.UTC)
		return first.AddDate(0, 1, -1).Format(finance.DateLayout)
	}
	if containsAny(l, "today") {
		return today.Format(finance.DateLayout)
	}
	if containsAny(l, "tomorrow") {
		return today.AddDate(0, 0, 1).Format(finance.DateLayout)
	}
	if containsAny(l, "next week") {
		return today.AddDate(0, 0, 7).Format(finance.DateLayout)
	}
	return ""
}
