// Package finance holds the deterministic cash engine. Every number the product
// displays is produced here, from integer cents and date-only arithmetic. The
// language model never computes, adjusts or re-derives any of it.
package finance

import (
	"fmt"
	"sort"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// DateLayout is the only date format crossing the API boundary.
const DateLayout = "2006-01-02"

// DefaultHorizonDays is the projection length when the caller does not choose.
const DefaultHorizonDays = 30

// MaxHorizonDays bounds a caller-supplied horizon.
const MaxHorizonDays = 120

// Input is everything the projection needs. It is fully explicit: the engine
// reads no clock, no environment and no global state.
type Input struct {
	// BaselineCents is cash on hand at the start of StartDate, before any event
	// of that day is applied. Historical transactions are already inside it and
	// are never re-applied.
	BaselineCents  int64
	BaselineAsOf   string
	BaselineSource string
	Currency       string

	StartDate    time.Time
	HorizonDays  int
	ReserveCents int64

	// Events are dated cash movements. Only events inside the window are
	// applied; anything on or before StartDate-1 is already in the baseline.
	Events []contracts.FinancialEvent
}

// ParseDate parses a date-only string in UTC.
func ParseDate(s string) (time.Time, error) {
	t, err := time.Parse(DateLayout, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q: expected YYYY-MM-DD", s)
	}
	return t, nil
}

// Day truncates to a UTC date.
func Day(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// Project walks the window one day at a time and returns the daily balances,
// the lowest projected balance with its date, and the reserve comparison.
//
// Reserve semantics: a balance exactly equal to the reserve is NOT a breach.
// Only a balance strictly below it breaches. One cent under does breach.
func Project(in Input) contracts.ScenarioResult {
	horizon := in.HorizonDays
	if horizon <= 0 {
		horizon = DefaultHorizonDays
	}
	if horizon > MaxHorizonDays {
		horizon = MaxHorizonDays
	}
	start := Day(in.StartDate)
	end := start.AddDate(0, 0, horizon-1)

	// Bucket future events by date. Events before the window are ignored: they
	// are already reflected in the baseline and must never be counted twice.
	byDate := map[string][]contracts.FinancialEvent{}
	applied := make([]contracts.FinancialEvent, 0, len(in.Events))
	for _, e := range in.Events {
		d, err := ParseDate(e.Date)
		if err != nil {
			continue
		}
		d = Day(d)
		if d.Before(start) || d.After(end) {
			continue
		}
		// Revenue is not cash. Only events explicitly marked as cash movements
		// may change the balance.
		if !e.AffectsCash {
			continue
		}
		byDate[e.Date] = append(byDate[e.Date], e)
		applied = append(applied, e)
	}
	sort.Slice(applied, func(i, j int) bool {
		if applied[i].Date != applied[j].Date {
			return applied[i].Date < applied[j].Date
		}
		return applied[i].ID < applied[j].ID
	})

	res := contracts.ScenarioResult{
		Currency:             in.Currency,
		BaselineBalanceCents: in.BaselineCents,
		BaselineAsOf:         in.BaselineAsOf,
		BaselineSource:       in.BaselineSource,
		StartDate:            start.Format(DateLayout),
		EndDate:              end.Format(DateLayout),
		ReserveCents:         in.ReserveCents,
		AppliedEvents:        applied,
	}

	balance := in.BaselineCents
	lowest := int64(0)
	lowestDate := ""

	for i := 0; i < horizon; i++ {
		d := start.AddDate(0, 0, i)
		key := d.Format(DateLayout)
		row := contracts.DayBalance{Date: key, OpeningCents: balance}

		evs := byDate[key]
		sort.Slice(evs, func(a, b int) bool { return evs[a].ID < evs[b].ID })
		for _, e := range evs {
			if e.AmountCents >= 0 {
				row.InflowCents += e.AmountCents
			} else {
				row.OutflowCents += -e.AmountCents
			}
			balance += e.AmountCents
			row.EventIDs = append(row.EventIDs, e.ID)
		}
		row.ClosingCents = balance
		row.BelowReserve = balance < in.ReserveCents
		if row.BelowReserve {
			res.BreachesReserve = true
			if res.FirstBreachDate == "" {
				res.FirstBreachDate = key
			}
		}
		if lowestDate == "" || balance < lowest {
			lowest, lowestDate = balance, key
		}
		res.Days = append(res.Days, row)
	}

	res.LowestCents = lowest
	res.LowestDate = lowestDate
	res.HeadroomCents = lowest - in.ReserveCents
	return res
}

// FormatUSD renders integer cents for display. Money never reaches the UI as a
// float.
func FormatUSD(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	whole := cents / 100
	frac := cents % 100
	s := addThousands(whole)
	out := fmt.Sprintf("$%s.%02d", s, frac)
	if neg {
		return "-" + out
	}
	return out
}

// FormatBRL renders integer cents of Brazilian reais.
func FormatBRL(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	out := fmt.Sprintf("R$%s.%02d", addThousands(cents/100), cents%100)
	if neg {
		return "-" + out
	}
	return out
}

func addThousands(n int64) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out)
}

// HumanDate renders a date-only string as "Sep 17".
func HumanDate(s string) string {
	t, err := ParseDate(s)
	if err != nil {
		return s
	}
	return t.Format("Jan 2")
}
