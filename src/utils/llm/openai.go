package llm

type OpenAI struct {
	// Define fields here if needed
	ApiKey string
	Model  string
	Url    string
}

func (o *OpenAI) SummarizeText(text string) (string, error) {
	// The implementation of summarizing text using OpenAI
	return "", nil
}
