package tasks

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/pkg/errors"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
	"github.com/rs/zerolog/log"
)

func transcribe(t *ent.Transcription) error {
	ctx := context.Background()
	_, err := db.Client().Transcription.UpdateOneID(t.ID).SetStatus(models.TsStatusTranscribing).Save(ctx)
	if err != nil {
		log.Error().Int("ID", t.ID).Err(err).Msg("Failed to update transcription status to 'transcribing'")
		return errors.Wrap(err, "failed to set transcribing status")
	}

	if t.SourceUrl != "" {
		err := errors.New("transcription from source URL not implemented")
		log.Error().Int("ID", t.ID).Err(err).Msg("Unimplemented feature")
		return err
	}

	rest := resty.New()
	transcribeAPI := fmt.Sprintf("%s/transcription", whisperApiHost)

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
		Post(transcribeAPI)

	if err != nil {
		log.Error().Int("ID", t.ID).Str("detail", res.Detail).Err(err).Msg("Error during the transcription API call")
		return errors.Wrapf(err, "failed to call transcription API for transcription ID %d", t.ID)
	}

	if resp.IsError() {
		err := fmt.Errorf("transcription API returned status %d", resp.StatusCode())
		log.Error().Int("ID", t.ID).Err(err).Str("api_error", res.Detail).Msg("Transcription API error")
		return err
	}

	log.Info().Str("elapsed_time", resp.Time().String()).Msg("Transcription done.")

	_, err = db.Client().Transcription.UpdateOneID(t.ID).
		SetResult(res).
		SetStatus(models.TsStatusDone).
		SetLanguage(res.Language).
		SetDuration(time.Duration(int64(res.Duration * 1e9)).String()).
		Save(ctx)

	if err != nil {
		log.Error().Int("ID", t.ID).Err(err).Msg("Could not update transcription with result")
		return errors.Wrapf(err, "failed to update transcription result for ID %d", t.ID)
	}

	return nil
}
