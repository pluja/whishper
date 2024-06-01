package llm

type Anthropic struct {
	// Define fields here if needed
	ApiKey string
	Model  string
	Url    string
}

func (a *Anthropic) SummarizeText(text string) (string, error) {
	// The implementation of summarizing text using Anthropic
	return "", nil
}
