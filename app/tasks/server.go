package tasks

import (
	"log"

	"github.com/hibiken/asynq"
	"github.com/pluja/anysub/utils"
)

var whisperApiHost = utils.Getenv("AS_WX_API_HOST", "http://127.0.0.1:8000")

func StartTaskServer(wah string) {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: utils.Getenv("REDIS_HOST", "127.0.0.1:6379")},
		asynq.Config{
			// Specify how many concurrent workers to use
			Concurrency: 10,

			// Optionally specify multiple queues with different priority.
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

	// mux maps a type to a handler
	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeTranscription, HandleNewTranscriptionTask)

	if err := srv.Run(mux); err != nil {
		log.Fatalf("could not run server: %v", err)
	}
}
