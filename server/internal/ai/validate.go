package ai

import (
	"fmt"
	"regexp"
	"strings"
)

// numberToken matches any number a model might write, with or without grouping
// separators, currency symbols or a percent sign.
var numberToken = regexp.MustCompile(`\d[\d,]*(?:\.\d+)?`)

// normalizeNumber reduces a written number to a comparable canonical form, so
// "$6,700.00", "6700" and "6,700.0" all compare equal.
func normalizeNumber(s string) string {
	s = strings.ReplaceAll(s, ",", "")
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
		s = strings.TrimSuffix(s, ".")
	}
	if s == "" {
		s = "0"
	}
	return s
}

// ExtractNumbers returns the canonical numbers appearing in the given text.
// The engine uses it to build the allowlist from its own facts, so the
// allowlist can never drift from what was actually computed.
func ExtractNumbers(texts ...string) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range texts {
		for _, m := range numberToken.FindAllString(t, -1) {
			n := normalizeNumber(m)
			if !seen[n] {
				seen[n] = true
				out = append(out, n)
			}
		}
	}
	return out
}

// bannedPhrases are claims the product must never make, regardless of wording
// elsewhere in the answer.
var bannedPhrases = []string{
	"gross margin", "net margin", "profit margin",
	"i have scheduled", "i have paid", "i've scheduled", "i've paid",
	"payment has been sent", "transfer completed", "i transferred",
	"good investment", "great investment", "worth the investment",
	"guaranteed return", "you will earn", "roi will be",
}

// ValidateAnswer rejects a model answer that contains a number the engine did
// not produce, or a claim the product is not allowed to make. A rejected answer
// is discarded entirely; the caller then shows the engine's own summary.
func ValidateAnswer(answer string, allowed []string) error {
	if strings.TrimSpace(answer) == "" {
		return fmt.Errorf("empty answer")
	}
	lower := strings.ToLower(answer)
	for _, p := range bannedPhrases {
		if strings.Contains(lower, p) {
			return fmt.Errorf("answer contains a disallowed claim: %q", p)
		}
	}
	allowSet := map[string]bool{}
	for _, a := range allowed {
		allowSet[normalizeNumber(a)] = true
	}
	for _, m := range numberToken.FindAllString(answer, -1) {
		n := normalizeNumber(m)
		if !allowSet[n] {
			return fmt.Errorf("answer contains %q, which the engine did not compute", m)
		}
	}
	return nil
}
