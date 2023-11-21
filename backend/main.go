package main

import (
	"flag"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"codeberg.org/pluja/whishper/api"
	"codeberg.org/pluja/whishper/database"
	"codeberg.org/pluja/whishper/monitor"
)

func main() {
	// Logging
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	zerolog.SetGlobalLevel(zerolog.InfoLevel)

	listenAddr := flag.String("addr", ":8080", "server listen address")
	uploadDir := flag.String("updir", "/app/uploads", "upload directory")
	asrEndpoint := flag.String("asr", "127.0.0.1:8000", "asr endpoint, i.e. localhost:9888")
	dbHost := flag.String("db", "mongo:27017", "database endpoint host, i.e. localhost:27017")
	dbUser := flag.String("dbuser", "root", "database user")
	dbPass := flag.String("dbpass", "example", "database password")
	translationEndpoint := flag.String("translation", "translate:5000", "translation endpoint, i.e. localhost:5000")
	dev := flag.Bool("dev", false, "development mode")
	flag.Parse()

	// Set environment variables
	if os.Getenv("UPLOAD_DIR") == "" {
		os.Setenv("UPLOAD_DIR", *uploadDir)
	}
	if os.Getenv("ASR_ENDPOINT") == "" {
		os.Setenv("ASR_ENDPOINT", *asrEndpoint)
	}
	if os.Getenv("TRANSLATION_ENDPOINT") == "" {
		os.Setenv("TRANSLATION_ENDPOINT", *translationEndpoint)
	}
	if os.Getenv("DB_ENDPOINT") == "" {
		os.Setenv("DB_ENDPOINT", *dbHost)
	}
	if os.Getenv("DB_USER") == "" {
		os.Setenv("DB_USER", *dbUser)
	}
	if os.Getenv("DB_PASS") == "" {
		os.Setenv("DB_PASS", *dbPass)
	}

	// Configure dev mode
	if *dev {
		log.Logger = log.Output(
			zerolog.ConsoleWriter{
				Out:        os.Stdout,
				TimeFormat: "15:04:05",
			},
		).With().Caller().Logger()
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	log.Debug().Msg("DEV MODE IS ON")
	log.Debug().Msgf("ListenAddr: %v", *listenAddr)
	log.Debug().Msgf("UploadDir: %v", *uploadDir)
	log.Debug().Msgf("AsrEndpoint: %v", *asrEndpoint)
	log.Debug().Msgf("TranslationEndpoint: %v", *translationEndpoint)
	log.Debug().Msgf("DbHost: %v", *dbHost)

	dabs := database.NewMongoDb()
	server := api.NewServer(*listenAddr, dabs)
	go monitor.StartMonitor(server)
	server.NewTranscriptionCh <- true
	server.Run()
}
