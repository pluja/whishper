export type Transcription = {
    language: string;
    duration: number;
    segments: Segment[];
    id: string;
    translations: Translation[];
}

export type Segment = {
    start: number;
    end: number;
    text: string;
    score: number;
    uuid: string;
    words?: WordData[];
};

type WordData = {
    start: number;
    end: number;
    text: string;
    score: number;
};

type Translation = {
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
    segments: Segment[];
};
