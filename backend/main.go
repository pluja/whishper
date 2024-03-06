package main

import (
	"flag"
	"os"

	"github.com/joho/godotenv"
	"github.com/pluja/anysub/server"
	"github.com/pluja/anysub/worker"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

var (
	dev bool
)

func init() {
	flag.BoolVar(&dev, "dev", false, "start in dev mode.")
	flag.Parse()
	godotenv.Load()

	// Configure dev mode
	if dev {
		log.Logger = log.Output(
			zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: "15:04:05",
			},
		).With().Caller().Logger()
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}
}

func main() {
	log.Info().Msg("Initializing server.")
	//_ = db.Client()
	go worker.Start()
	s := server.NewServer(":1337")
	if err := s.Run(); err != nil {
		log.Fatal().Err(err)
	}
}
