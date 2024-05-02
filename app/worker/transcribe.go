package worker

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
	"github.com/pluja/anysub/utils"
	"github.com/rs/zerolog/log"
)

func transcribe(t *ent.Transcription) error {
	client := db.Client()

	// Set as transcribing
	client.Transcription.UpdateOneID(t.ID).SetStatus(models.TsStatusTranscribing).Save(context.Background())

	if t.SourceUrl != "" {
		// TODO: Handle media URLs
		return fmt.Errorf("not implemented")
	}

	rest := resty.New()
	transcribe_api := fmt.Sprintf("%s/transcription", utils.Getenv("AS_WX_API_HOST", "wxapi:8000"))

	var res models.TranscriptionResult

	resp, err := rest.R().
		SetQueryParams(map[string]string{
			"model_size": t.ModelSize,
			"task":       t.Task,
			"language":   t.Language,
			"device":     t.Device,
			"filename":   t.FileName,
			"diarize":    strconv.FormatBool(t.Diarize),
		}).
		SetHeader("Accept", "application/json").
		SetResult(&res).
		Post(transcribe_api)

	if err != nil {
		log.Err(err).Int("ID", t.ID).Str("detail", res.Detail).Msg("Error with transcription")
		return fmt.Errorf("%s: %s", err.Error(), res.Detail)
	}

	log.Debug().Msgf("Result: %+v", res)
	log.Debug().Msgf("Response: %+v", string(resp.Body()))

	log.Info().Str("elapsed_time", resp.Time().String()).Msg("Transcription done.")
	t, err = client.Transcription.UpdateOneID(t.ID).SetResult(res).SetLanguage(res.Language).SetDuration(time.Duration(int64(res.Duration * 1e9)).String()).Save(context.Background())
	if err != nil {
		log.Err(err).Int("ID", t.ID).Msg("Could not update transcription")
		return err
	}
	return nil
}
