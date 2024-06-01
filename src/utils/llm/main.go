package llm

import (
	"fmt"
	"os"
)

type Model interface {
	SummarizeText(text string) (string, error)
}

func GetModel(backend string) (Model, error) {
	switch backend {
	case "openai":
		return &OpenAI{
			ApiKey: os.Getenv("OPENAI_API_KEY"),
			Model:  os.Getenv("OPENAI_API_MODEL"),
			Url:    os.Getenv("OPENAI_API_URL"),
		}, nil
	case "anthropic":
		return &Anthropic{
			ApiKey: os.Getenv("ANTHROPIC_API_KEY"),
			Model:  os.Getenv("ANTHROPIC_API_MODEL"),
			Url:    os.Getenv("ANTHROPIC_API_URL"),
		}, nil
	default:
		return nil, fmt.Errorf("unknown backend: %s", backend)
	}
}

// TODO: Finish SummarizeText functions
