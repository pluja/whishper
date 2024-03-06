package models

const (
	TsStatusPending      = "pending"
	TsStatusTranscribing = "transcribing"
	TsStatusTranslating  = "translating"
	TsStatusDone         = "done"
	TsStatusError        = "error"
)

type WordData struct {
	Word    string  `json:"word"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Score   float64 `json:"score"`
	Speaker string  `json:"speaker"`
}

type Segment struct {
	ID    string     `json:"id"`
	Text  string     `json:"text"`
	Start float64    `json:"start"`
	End   float64    `json:"end"`
	Score float64    `json:"score"`
	Words []WordData `json:"words"`
}

type TranscriptionResult struct {
	Text     string    `json:"text"`
	Language string    `json:"language"`
	Duration float64   `json:"duration"`
	Segments []Segment `json:"segments"`
	Detail   string    `json:"detail"`
}
