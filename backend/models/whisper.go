package models

type WhisperResult struct {
	Language string    `json:"language"`
	Duration float64   `json:"duration"`
	Segments []Segment `json:"segments"`
	Text     string    `json:"text"`
}

type Segment struct {
	End   float64 `json:"end"`
	ID    string  `json:"id"`
	Start float64 `json:"start"`
	Score float64 `json:"score"`
	Text  string  `json:"text"`
	Words []Word  `json:"words"`
}

type Word struct {
	End   float64 `json:"end"`
	Start float64 `json:"start"`
	Word  string  `json:"word"`
	Score float64 `json:"score"`
}
