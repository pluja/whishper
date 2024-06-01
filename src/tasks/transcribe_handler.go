package tasks

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
)

const (
	TypeTranscription = "transcription:create"
)

func NewTranscriptionTask(tx ent.Transcription) (*asynq.Task, error) {
	payload, err := json.Marshal(tx)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeTranscription, payload), nil
}

func HandleNewTranscriptionTask(ctx context.Context, t *asynq.Task) error {
	var tx ent.Transcription
	if err := json.Unmarshal(t.Payload(), &tx); err != nil {
		db.Client().Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	err := transcribe(&tx)
	if err != nil {
		db.Client().Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		return fmt.Errorf("transcription failed failed: %v", err)
	}

	return nil
}
