package ai

import "testing"

// The model may only repeat numbers the engine produced. This is the guard that
// stops a fluent answer from inventing a figure.
func TestValidateAnswerRejectsNumbersTheEngineDidNotCompute(t *testing.T) {
	facts := []string{
		"Lowest projected cash is $6,700.00 on Sep 17, against a $5,000.00 reserve.",
		"A payout delay of 5 day(s) is the first that breaches.",
	}
	allowed := ExtractNumbers(facts...)

	good := "Your cash bottoms out at $6,700.00 on Sep 17, which is above the $5,000.00 floor. A 5 day delay is the first that would break it."
	if err := ValidateAnswer(good, allowed); err != nil {
		t.Fatalf("a faithful answer was rejected: %v", err)
	}

	bad := []string{
		"Your cash bottoms out at $6,700.00, leaving you $1,700.00 of headroom.", // 1,700 never stated
		"Sales grew 34% last month.",                  // fabricated
		"You could lose $12,000 if the payout slips.", // fabricated
	}
	for _, b := range bad {
		if err := ValidateAnswer(b, allowed); err == nil {
			t.Errorf("answer with an uncomputed number was accepted: %q", b)
		}
	}
}

func TestValidateAnswerNormalisesEquivalentNumbers(t *testing.T) {
	allowed := ExtractNumbers("Lowest projected cash is $6,700.00.")
	for _, s := range []string{"$6,700.00", "$6700", "6,700.0", "$6700.00"} {
		if err := ValidateAnswer("Cash reaches "+s+" at the lowest.", allowed); err != nil {
			t.Errorf("%q should compare equal to $6,700.00: %v", s, err)
		}
	}
}

func TestValidateAnswerRejectsDisallowedClaims(t *testing.T) {
	allowed := ExtractNumbers("Lowest projected cash is $6,700.00.")
	for _, s := range []string{
		"Your gross margin supports this.",
		"I have scheduled the payment for you.",
		"This is a good investment.",
		"Your ROI will be strong.",
	} {
		if err := ValidateAnswer(s, allowed); err == nil {
			t.Errorf("disallowed claim accepted: %q", s)
		}
	}
}

func TestUnavailableProviderNeverFabricates(t *testing.T) {
	u := NewUnavailable("no key")
	if u.Available() {
		t.Fatal("the unavailable provider must never report itself available")
	}
	if _, err := u.Explain(t.Context(), Prompt{}); err != ErrUnavailable {
		t.Fatal("Explain must fail rather than return invented prose")
	}
	if st := u.Status(); st.State != "unavailable" || !st.Degraded {
		t.Fatalf("status must be honest, got %+v", st)
	}
}
