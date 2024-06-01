package tasks

import (
	"context"
	"log"

	"github.com/hibiken/asynq"

	"github.com/pluja/anysub/utils"
)

var whisperApiHost = utils.Getenv("AS_WX_API_HOST", "http://127.0.0.1:8000")

func StartTaskServer(wah string) {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: utils.Getenv("REDIS_HOST", "127.0.0.1:6379")},
		asynq.Config{
			Concurrency: 1,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
		},
	)

	if wah != "" {
		whisperApiHost = wah
	}

	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeTranscription, func(ctx context.Context, t *asynq.Task) error {
		return HandleNewTranscriptionTask(ctx, t)
	})

	if err := srv.Run(mux); err != nil {
		log.Fatalf("could not run server: %v", err)
	}
}
