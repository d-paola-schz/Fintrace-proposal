package data

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// NessieAccount mirrors the fields Nessie actually returns for an account.
// The struct is intentionally permissive: unknown fields are ignored and the
// adapter records which fields were present so the UI can be honest about it.
type NessieAccount struct {
	ID            string  `json:"_id"`
	Type          string  `json:"type"`
	Nickname      string  `json:"nickname"`
	Rewards       float64 `json:"rewards"`
	Balance       float64 `json:"balance"`
	AccountNumber string  `json:"account_number"`
	CustomerID    string  `json:"customer_id"`
}

// NessieTxn covers the shared shape of deposits, withdrawals and purchases.
type NessieTxn struct {
	ID              string  `json:"_id"`
	Type            string  `json:"type"`
	TransactionDate string  `json:"transaction_date"`
	Status          string  `json:"status"`
	Amount          float64 `json:"amount"`
	Description     string  `json:"description"`
	PayeeID         string  `json:"payee_id"`
	PayerID         string  `json:"payer_id"`
	Medium          string  `json:"medium"`
}

// NessieBill is the scheduled-payment resource.
type NessieBill struct {
	ID              string  `json:"_id"`
	Status          string  `json:"status"`
	Payee           string  `json:"payee"`
	Nickname        string  `json:"nickname"`
	PaymentAmount   float64 `json:"payment_amount"`
	PaymentDate     string  `json:"payment_date"`
	RecurringDate   int     `json:"recurring_date"`
	UpcomingPayment string  `json:"upcoming_payment_date"`
	AccountID       string  `json:"account_id"`
}

// NessieSnapshot is what the rest of the app consumes, whether it came from the
// live sandbox or from the committed fallback file.
type NessieSnapshot struct {
	Source       string       `json:"source"` // live | snapshot | unavailable
	AsOf         string       `json:"asOf"`
	AccountID    string       `json:"accountId"`
	AccountLabel string       `json:"accountLabel"`
	BalanceCents int64        `json:"balanceCents"`
	Currency     string       `json:"currency"`
	Deposits     []NessieTxn  `json:"deposits"`
	Withdrawals  []NessieTxn  `json:"withdrawals"`
	Bills        []NessieBill `json:"bills"`
	Detail       string       `json:"detail"`
	// FieldsSeen records the keys the live API actually returned, so the demo
	// can state what was verified rather than what the docs promise.
	FieldsSeen []string `json:"fieldsSeen,omitempty"`
}

type NessieClient struct {
	baseURL   string
	key       string
	accountID string
	http      *http.Client

	mu       sync.RWMutex
	cached   *NessieSnapshot
	cachedAt time.Time
	lastErr  string
}

func NewNessieClient() *NessieClient {
	base := strings.TrimRight(os.Getenv("NESSIE_BASE_URL"), "/")
	if base == "" {
		base = "https://api.nessieisreal.com"
	}
	return &NessieClient{
		baseURL:   base,
		key:       os.Getenv("NESSIE_API_KEY"),
		accountID: os.Getenv("NESSIE_ACCOUNT_ID"),
		http:      &http.Client{Timeout: 8 * time.Second},
	}
}

func (c *NessieClient) Configured() bool { return c.key != "" }

func (c *NessieClient) get(ctx context.Context, path string, out any) ([]string, error) {
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	url := fmt.Sprintf("%s%s%skey=%s", c.baseURL, path, sep, c.key)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Never echo the URL: it carries the key.
		return nil, fmt.Errorf("nessie %s returned %d", path, resp.StatusCode)
	}
	keys := observedKeys(body)
	if err := json.Unmarshal(body, out); err != nil {
		return keys, fmt.Errorf("nessie %s: unexpected shape: %w", path, err)
	}
	return keys, nil
}

// observedKeys lists the JSON keys actually present in the first object of a
// response, so the app can report the verified schema instead of assuming it.
func observedKeys(body []byte) []string {
	var arr []map[string]json.RawMessage
	if err := json.Unmarshal(body, &arr); err == nil && len(arr) > 0 {
		return sortedKeys(arr[0])
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(body, &obj); err == nil {
		return sortedKeys(obj)
	}
	return nil
}

func sortedKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func cents(v float64) int64 {
	if v >= 0 {
		return int64(v*100 + 0.5)
	}
	return -int64(-v*100 + 0.5)
}

// Snapshot returns live sandbox data when a key is configured and the calls
// succeed, and the committed dated fallback otherwise. It never blends the two.
func (c *NessieClient) Snapshot(ctx context.Context, fallback *NessieSnapshot) *NessieSnapshot {
	c.mu.RLock()
	if c.cached != nil && time.Since(c.cachedAt) < 60*time.Second {
		s := c.cached
		c.mu.RUnlock()
		return s
	}
	c.mu.RUnlock()

	if !c.Configured() {
		c.setErr("NESSIE_API_KEY not set")
		return fallback
	}
	snap, err := c.fetch(ctx)
	if err != nil {
		c.setErr(err.Error())
		return fallback
	}
	c.mu.Lock()
	c.cached, c.cachedAt, c.lastErr = snap, time.Now(), ""
	c.mu.Unlock()
	return snap
}

func (c *NessieClient) setErr(msg string) {
	c.mu.Lock()
	c.lastErr = msg
	c.mu.Unlock()
}

func (c *NessieClient) fetch(ctx context.Context) (*NessieSnapshot, error) {
	accountID := c.accountID
	var acct NessieAccount
	var fields []string

	if accountID == "" {
		var accounts []NessieAccount
		ks, err := c.get(ctx, "/accounts", &accounts)
		if err != nil {
			return nil, err
		}
		// Verified behaviour of the live sandbox, 2026-09-12: an unrecognised key
		// returns HTTP 200 with an empty array rather than an authentication
		// error, and a missing account id returns 404 with an empty body. An
		// empty list therefore means "this key sees nothing", not "no accounts
		// exist", and must fall back rather than produce a zero balance.
		if len(accounts) == 0 {
			return nil, fmt.Errorf("the configured key returned no accounts (the sandbox answers 200 with an empty list for an unrecognised key)")
		}
		// Prefer the account with the largest balance so the demo has headroom.
		acct = accounts[0]
		for _, a := range accounts[1:] {
			if a.Balance > acct.Balance {
				acct = a
			}
		}
		accountID, fields = acct.ID, ks
	} else {
		ks, err := c.get(ctx, "/accounts/"+accountID, &acct)
		if err != nil {
			return nil, err
		}
		if acct.ID == "" {
			return nil, fmt.Errorf("nessie returned no account for the configured id")
		}
		fields = ks
	}

	snap := &NessieSnapshot{
		Source:       "live",
		AsOf:         time.Now().UTC().Format(time.RFC3339),
		AccountID:    accountID,
		AccountLabel: strings.TrimSpace(acct.Nickname + " " + acct.Type),
		BalanceCents: cents(acct.Balance),
		Currency:     "USD",
		FieldsSeen:   fields,
		Detail:       "Live read from the Nessie sandbox.",
	}
	// These are best-effort: a missing sub-resource must not fail the whole read.
	_, _ = c.get(ctx, "/accounts/"+accountID+"/deposits", &snap.Deposits)
	_, _ = c.get(ctx, "/accounts/"+accountID+"/withdrawals", &snap.Withdrawals)
	_, _ = c.get(ctx, "/accounts/"+accountID+"/bills", &snap.Bills)
	return snap, nil
}

// Verify performs one real read and reports what actually came back. It never
// returns balances or ids in full, only whether the sandbox answered.
func (c *NessieClient) Verify(ctx context.Context) (string, error) {
	if !c.Configured() {
		return "NESSIE_API_KEY is not set.", fmt.Errorf("not configured")
	}
	snap, err := c.fetch(ctx)
	if err != nil {
		c.setErr(err.Error())
		return err.Error(), err
	}
	c.mu.Lock()
	c.cached, c.cachedAt, c.lastErr = snap, time.Now(), ""
	c.mu.Unlock()
	return fmt.Sprintf(
		"Read account %s: balance present, %d deposit(s), %d withdrawal(s), %d bill(s). Fields returned by the API: %s.",
		redactID(snap.AccountID), len(snap.Deposits), len(snap.Withdrawals), len(snap.Bills),
		strings.Join(snap.FieldsSeen, ", ")), nil
}

func (c *NessieClient) Status() contracts.SourceStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	st := contracts.SourceStatus{Name: "nessie"}
	switch {
	case !c.Configured():
		// The committed file was written by us, not captured from Nessie, so it
		// is a fixture. Calling it a snapshot would imply we fetched it once.
		st.State = "fixture"
		st.Degraded = true
		st.Detail = "NESSIE_API_KEY is not set. The opening balance comes from the committed demo fixture, which was never retrieved from the Nessie API."
	case c.cached != nil && c.lastErr == "":
		st.State = "live"
		st.AsOf = c.cached.AsOf
		st.Detail = fmt.Sprintf("Live sandbox account %s.", redactID(c.cached.AccountID))
	case c.lastErr != "":
		st.State = "fixture"
		st.Degraded = true
		st.Detail = "The Nessie read failed, so the opening balance falls back to the committed demo fixture. " + c.lastErr
	default:
		st.State = "configured"
		st.Degraded = true
		st.Detail = "A Nessie key is configured but no read has succeeded yet this run, so the sandbox is not confirmed connected."
	}
	return st
}

func redactID(id string) string {
	if len(id) <= 6 {
		return "…"
	}
	return "…" + id[len(id)-6:]
}
