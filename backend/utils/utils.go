package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/wader/goutubedl"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"codeberg.org/pluja/whishper/models"
)

func SanitizeFilename(filename string) string {
	// First remove trailing spaces
	filename = strings.TrimSpace(filename)
	// Then remove quotes and dots
	filename = strings.Trim(filename, `"'.`)
	reg, _ := regexp.Compile("[^a-zA-Z0-9]+")
	filename = reg.ReplaceAllString(filename, "_")
	return filename
}

func DownloadMedia(t *models.Transcription) (string, error) {
	if t.SourceUrl == "" {
		log.Debug().Msg("Source URL is empty")
		return "", fmt.Errorf("source URL is empty")
	}

	if t.ID == primitive.NilObjectID {
		log.Debug().Msg("Transcription ID is empty")
		return "", fmt.Errorf("transcription ID is empty")
	}

	goutubedl.Path = "yt-dlp"
	result, err := goutubedl.New(context.Background(), t.SourceUrl, goutubedl.Options{})
	if err != nil {
		log.Debug().Err(err).Msg("Error creating goutubedl")
		return "", err
	}

	downloadResult, err := result.Download(context.Background(), "best")
	if err != nil {
		log.Debug().Err(err).Msg("Error downloading media")
		return "", err
	}

	filename := fmt.Sprintf("%v%v%v", t.ID.Hex(), models.FileNameSeparator, result.Info.Title)
	filename = SanitizeFilename(filename)

	defer downloadResult.Close()
	f, err := os.Create(filepath.Join(os.Getenv("UPLOAD_DIR"), filename))
	if err != nil {
		log.Debug().Err(err).Msg("Error creating file")
		return "", err
	}
	defer f.Close()
	io.Copy(f, downloadResult)

	return filename, nil
}

func SendTranscriptionRequest(t *models.Transcription, body *bytes.Buffer, writer *multipart.Writer) (*models.WhisperResult, error) {
	url := fmt.Sprintf("http://%v/transcribe?model_size=%v&task=%v&language=%v&device=%v", os.Getenv("ASR_ENDPOINT"), t.ModelSize, t.Task, t.Language, t.Device)
	// Send transcription request to transcription service
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		log.Debug().Err(err).Msg("Error creating request to transcription service")
		return nil, err
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Debug().Err(err).Msg("Error sending request")
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Debug().Err(err).Msg("Error reading response body")
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		log.Debug().Msgf("Response from %v: %v", url, string(b))
		log.Debug().Err(err).Msgf("Invalid response status %v:", resp.StatusCode)
		return nil, errors.New("invalid status")
	}

	var asrResponse *models.WhisperResult
	if err := json.Unmarshal(b, &asrResponse); err != nil {
		log.Debug().Err(err).Msg("Error decoding response")
		return nil, err
	}

	return asrResponse, nil

}
