package utils

type SubtitleConfig struct {
	ColorizeSpeakers bool              `json:"colorize_speakers"`
	MaxLengthChars   int               `json:"max_length_chars"`
	SpeakerColors    map[string]string `json:"speaker_colors"`
}
