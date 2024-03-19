package subtitles

type SubtitleConfig struct {
	ColorizeSpeakers bool              `json:"colorize_speakers"`
	MaxLengthChars   int               `json:"max_length_chars"`
	SpeakerColors    map[string]string `json:"speaker_colors"`
	MsDelay          int64             `json:"delay_ms"`
	MaxTimeGap       int64             `json:"max_gap_ms"`
}
