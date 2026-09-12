package data

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/preflight/preflight/server/internal/contracts"
)

// OlistSummary mirrors data/olist-seller-summary.json, written offline by
// scripts/prepare_olist.py. Nothing here is computed at request time.
type OlistSummary struct {
	DataVersion string `json:"dataVersion"`
	Currency    string `json:"currency"`
	Dataset     struct {
		Name          string `json:"name"`
		RetrievedFrom string `json:"retrievedFrom"`
		Note          string `json:"note"`
		Files         map[string]struct {
			File   string `json:"file"`
			SHA256 string `json:"sha256"`
			Rows   int    `json:"rows"`
		} `json:"files"`
	} `json:"dataset"`
	SellerSelection struct {
		SelectedSellerID  string `json:"selectedSellerId"`
		SpecifiedSellerID string `json:"specifiedSellerId"`
		Substituted       bool   `json:"substituted"`
		Reason            string `json:"reason"`
		SpecifiedStats    struct {
			ItemCount  int    `json:"itemCount"`
			OrderCount int    `json:"orderCount"`
			FirstDate  string `json:"firstDate"`
			LastDate   string `json:"lastDate"`
		} `json:"specifiedSellerStats"`
	} `json:"sellerSelection"`
	Seller struct {
		SellerID         string `json:"sellerId"`
		City             string `json:"city"`
		State            string `json:"state"`
		ItemCount        int    `json:"itemCount"`
		OrderCount       int    `json:"orderCount"`
		DistinctProducts int    `json:"distinctProducts"`
		FirstSaleDate    string `json:"firstSaleDate"`
		LastSaleDate     string `json:"lastSaleDate"`
		ItemRevenueCents int64  `json:"itemRevenueCents"`
		CategoryCount    int    `json:"categoryCount"`
		Categories       []struct {
			Name             string `json:"name"`
			ItemCount        int    `json:"itemCount"`
			ItemRevenueCents int64  `json:"itemRevenueCents"`
		} `json:"categories"`
	} `json:"seller"`
	Window      WindowTotals `json:"window"`
	PriorWindow WindowTotals `json:"priorWindow"`
	DailyRange  struct {
		Start string `json:"start"`
		End   string `json:"end"`
	} `json:"dailyRange"`
	WindowSelection struct {
		AnchorDate string `json:"anchorDate"`
		ChosenBy   string `json:"chosenBy"`
		Disclosure string `json:"disclosure"`
	} `json:"windowSelection"`
	DailySales  []DailySale `json:"dailySales"`
	TopProducts []struct {
		ProductID        string `json:"productId"`
		Category         string `json:"category"`
		ItemCount        int    `json:"itemCount"`
		ItemRevenueCents int64  `json:"itemRevenueCents"`
		UnitPriceCents   int64  `json:"unitPriceCents"`
	} `json:"topProducts"`
	NotEmitted []string `json:"notEmitted"`
	Notes      []string `json:"notes"`
}

type WindowTotals struct {
	Start            string `json:"start"`
	End              string `json:"end"`
	ItemCount        int    `json:"itemCount"`
	OrderCount       int    `json:"orderCount"`
	ItemRevenueCents int64  `json:"itemRevenueCents"`
}

type DailySale struct {
	Date              string   `json:"date"`
	ItemCount         int      `json:"itemCount"`
	OrderCount        int      `json:"orderCount"`
	ItemRevenueCents  int64    `json:"itemRevenueCents"`
	OrderIDs          []string `json:"orderIds"`
	OrderIDsTruncated bool     `json:"orderIdsTruncated"`
}

// Assumptions mirrors data/demo-assumptions.json.
type Assumptions struct {
	Version          string `json:"version"`
	DisplayCurrency  string `json:"displayCurrency"`
	BusinessTimezone string `json:"businessTimezone"`
	FX               struct {
		ID         string  `json:"id"`
		BRLPerUSD  float64 `json:"brlPerUsd"`
		Label      string  `json:"label"`
		Detail     string  `json:"detail"`
		Provenance string  `json:"provenance"`
	} `json:"fx"`
	TimeShift struct {
		ID     string `json:"id"`
		Label  string `json:"label"`
		Detail string `json:"detail"`
	} `json:"timeShift"`
	Baseline struct {
		ID         string `json:"id"`
		Label      string `json:"label"`
		Detail     string `json:"detail"`
		Provenance string `json:"provenance"`
	} `json:"baseline"`
	Reserve struct {
		ID          string `json:"id"`
		Label       string `json:"label"`
		AmountCents int64  `json:"amountCents"`
		Currency    string `json:"currency"`
		Detail      string `json:"detail"`
		Provenance  string `json:"provenance"`
		Editable    bool   `json:"editable"`
		Field       string `json:"field"`
	} `json:"reserve"`
	MarketplaceFee struct {
		ID         string  `json:"id"`
		RatePct    float64 `json:"ratePct"`
		Label      string  `json:"label"`
		Detail     string  `json:"detail"`
		Provenance string  `json:"provenance"`
	} `json:"marketplaceFee"`
	Payout struct {
		ID         string `json:"id"`
		Label      string `json:"label"`
		OffsetDays int    `json:"offsetDaysFromToday"`
		Detail     string `json:"detail"`
		Provenance string `json:"provenance"`
		Editable   bool   `json:"editable"`
		Field      string `json:"field"`
	} `json:"payout"`
	ScheduledOutflows []struct {
		ID          string `json:"id"`
		Label       string `json:"label"`
		OffsetDays  int    `json:"offsetDaysFromToday"`
		AmountCents int64  `json:"amountCents"`
		Currency    string `json:"currency"`
		Detail      string `json:"detail"`
		Provenance  string `json:"provenance"`
	} `json:"scheduledOutflows"`
	NotDerivable []string `json:"notDerivable"`
}

// Store holds the read-only prepared data for the process lifetime.
type Store struct {
	Olist          OlistSummary
	Assume         Assumptions
	NessieFallback NessieSnapshot
	loadedAt       time.Time
	dir            string
}

func Load(dir string) (*Store, error) {
	s := &Store{dir: dir, loadedAt: time.Now()}
	if err := readJSON(filepath.Join(dir, "olist-seller-summary.json"), &s.Olist); err != nil {
		return nil, err
	}
	if err := readJSON(filepath.Join(dir, "demo-assumptions.json"), &s.Assume); err != nil {
		return nil, err
	}
	if err := readJSON(filepath.Join(dir, "nessie-fallback.json"), &s.NessieFallback); err != nil {
		return nil, err
	}
	if s.Assume.FX.BRLPerUSD <= 0 {
		return nil, fmt.Errorf("demo-assumptions.json: brlPerUsd must be > 0")
	}
	if len(s.Olist.DailySales) == 0 {
		return nil, fmt.Errorf("olist-seller-summary.json: no dailySales; run scripts/prepare_olist.py")
	}
	return s, nil
}

func readJSON(path string, dst any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", filepath.Base(path), err)
	}
	if err := json.Unmarshal(b, dst); err != nil {
		return fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}
	return nil
}

func (s *Store) DataVersion() string { return s.Olist.DataVersion + "+" + s.Assume.Version }

func (s *Store) OlistStatus() contracts.SourceStatus {
	return contracts.SourceStatus{
		Name:  "olist",
		State: "snapshot",
		AsOf:  s.Olist.DailyRange.End,
		Detail: fmt.Sprintf(
			"Prepared offline from the Olist public dataset: seller %s, %d order items, %s to %s. Historical BRL marketplace records, time-shifted onto the current calendar for display.",
			short(s.Olist.Seller.SellerID), s.Olist.Seller.ItemCount,
			s.Olist.Seller.FirstSaleDate, s.Olist.Seller.LastSaleDate),
	}
}

func short(id string) string {
	if len(id) <= 10 {
		return id
	}
	return id[:8] + "…"
}

// BRLToUSDCents converts using the single declared scenario rate. The caller is
// responsible for displaying the original BRL amount too.
func (s *Store) BRLToUSDCents(brlCents int64) int64 {
	return int64(float64(brlCents)/s.Assume.FX.BRLPerUSD + 0.5)
}
