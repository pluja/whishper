package utils

import (
	"fmt"
	"strings"
	"time"

	"github.com/duke-git/lancet/v2/slice"
	"github.com/pluja/anysub/ent"
)

var (
	colors = []string{
		"aqua",
		"yellow",
		"lime",
		"aquamarine",
		"blue",
		"blueviolet",
		"mediumpurple",
		"orange",
		"springgreen",
		"tomato",
		"red",
		"pink",
		"brown",
	}
)

func GenerateSubsVTT(t *ent.Transcription) string {
	var vttBuilder strings.Builder
	cols := colors

	// Write the WebVTT file header
	vttBuilder.WriteString("WEBVTT\n\n")

	// Define a map to keep track of speaker colors
	speakerColors := make(map[string]string)

	// Define the STYLE block if there are speaker colors to declare
	if len(t.Result.Segments) > 0 && len(t.Result.Segments[0].Words) > 0 {
		vttBuilder.WriteString("STYLE\n")
	}

	// Calculate the colors for the speakers and construct the STYLE block
	for _, segment := range t.Result.Segments {
		for _, word := range segment.Words {
			if _, ok := speakerColors[word.Speaker]; !ok && word.Speaker != "" {
				color, ind := slice.Random(cols)
				slice.DeleteAt(cols, ind)
				speakerColors[word.Speaker] = color

				// Add the color style for the current speaker
				vttBuilder.WriteString(fmt.Sprintf("::cue(v[voice=\"%s\"]) { color: %s; }\n", word.Speaker, color))
			}
		}
	}
	vttBuilder.WriteString("\n")

	cueCounter := 1 // Start a counter for cue numbering

	// Add the subtitle items (cues)
	for _, segment := range t.Result.Segments {
		for _, word := range segment.Words {
			// Format the times for the start and end of the cue
			startTime := formatVTTTime(word.Start)
			endTime := formatVTTTime(word.End)

			// Assign class if speaker is not an empty string
			//class := ""
			voice := ""
			if word.Speaker != "" {
				//class = fmt.Sprintf(" class=\"%s\"", word.Speaker)
				voice = fmt.Sprintf("<v %s>", word.Speaker)
			}

			// Write the cue number, start and end times, class (if any), and the word
			//vttBuilder.WriteString(fmt.Sprintf("%d\n", cueCounter))
			vttBuilder.WriteString(fmt.Sprintf("%s --> %s\n", startTime, endTime)) //, class))
			vttBuilder.WriteString(voice + word.Word + "\n\n")

			cueCounter++ // Increment the cue counter
		}
	}

	return vttBuilder.String()
}

// Helper function to format a float64 seconds value into a WebVTT timestamp
func formatVTTTime(seconds float64) string {
	t := time.Duration(seconds * float64(time.Second))
	hours := t / time.Hour
	t -= hours * time.Hour
	minutes := t / time.Minute
	t -= minutes * time.Minute
	seconds = t.Seconds()
	return fmt.Sprintf("%02d:%02d:%06.3f", hours, minutes, seconds)
}
