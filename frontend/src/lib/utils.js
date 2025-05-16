import {transcriptions} from './stores';
import { dev } from '$app/environment';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export let CLIENT_API_HOST = browser ? `${dev ? env.PUBLIC_API_HOST : ""}` : `${env.PUBLIC_INTERNAL_API_HOST}`;
export let CLIENT_WS_HOST = browser ? `${dev ? env.PUBLIC_API_HOST.replace("http://", "").replace("https://", "") : ""}` :  `${dev ? env.PUBLIC_INTERNAL_API_HOST.replace("http://", "").replace("https://", "") : ""}`;

// URL Validator
export const validateURL = function (url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

export const deleteTranscription = async function (id) {
    const res = await fetch(`${CLIENT_API_HOST}/api/transcriptions/${id}`, {
        method: "DELETE"
    });

    if (res.ok) {
        transcriptions.update((_transcriptions) => _transcriptions.filter(t => t.id !== id));
    }
}

export const getRandomSentence = function () {
    const sentences = [
        "Audio in, text out. What's your sound about?",
        "Drop the beat, I'll drop the text!",
        "Everybody knows the bird is the word!",
        "From soundcheck to spellcheck!",
        "I got 99 problems but transcribing ain't one!",
        "I'm all ears!",
        "iTranscribe, you dictate!",
        "Lost for words?",
        "Sound check 1, 2, 3...",
        "Sound's up! What's your script?",
        "Transcribe, transcribe, transcribe!",
        "What are you transcribing today?",
        "What's the story, morning wordy?",
        "Words, don't come easy, but I can help find the way.",
        "You speak, I write. It's no magic, just AI!",
        "Can't understand that language? I can translate!",
        "I mean every word I say!"
    ]

    const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];

    return randomSentence;
}

// Expects a segments array with start, end and text properties
export const downloadSRT = function (jsonData, title) {
    let srtContent = '';

    // HH:MM:SS,fff
    let getTimecode = function(totalSeconds) {
        let hours = Math.floor(totalSeconds / 60 / 60);
        if (hours > 99) {
            throw new Error("SRT format does not support timecodes >= 100 hours");
        }
        let minutes = Math.floor(totalSeconds / 60) % 60;
        let seconds = Math.floor(totalSeconds) % 60;
        let milliseconds = Math.round(totalSeconds * 1000) % 1000;

        // Zero pad numbers
        let hoursStr = String(hours).padStart(2, '0');
        let minutesStr = String(minutes).padStart(2, '0');
        let secondsStr = String(seconds).padStart(2, '0');
        let millisecondsStr = String(milliseconds).padStart(3, '0');

        return `${hoursStr}:${minutesStr}:${secondsStr},${millisecondsStr}`;
    };
    
    jsonData.forEach((segment, index) => {
        let start = getTimecode(segment.start);
        let end = getTimecode(segment.end);
    
        srtContent += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`;
    });
  
    let srtBlob = new Blob([srtContent], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.srt`;
    link.click();
}

// Downloads received text as a TXT file
export const downloadTXT = function (text, title) {
    let srtBlob = new Blob([text], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.txt`;
    link.click();
}

// Downloads received JSON data as a JSON file
export const downloadJSON = function (jsonData, title) {
    let srtBlob = new Blob([JSON.stringify(jsonData)], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.json`;
    link.click();
}

// Expects a segments array with start, end and text properties
export const downloadVTT = function (jsonData, title) {
    let vttContent = 'WEBVTT\n\n'; // VTT files start with "WEBVTT" line

    // [[H...]HH:]MM:SS.fff
    let getTimecode = function(totalSeconds) {
        let hours = Math.floor(totalSeconds / 60 / 60);
        let minutes = Math.floor(totalSeconds / 60) % 60;
        let seconds = Math.floor(totalSeconds) % 60;
        let milliseconds = Math.round(totalSeconds * 1000) % 1000;

        // Zero pad numbers
        let hoursStr = String(hours).padStart(2, '0');
        let minutesStr = String(minutes).padStart(2, '0');
        let secondsStr = String(seconds).padStart(2, '0');
        let millisecondsStr = String(milliseconds).padStart(3, '0');

        if (hours > 0) {
            return `${hoursStr}:${minutesStr}:${secondsStr}.${millisecondsStr}`;
        } else {
            return `${minutesStr}:${secondsStr}.${millisecondsStr}`
        }
    };
  
    jsonData.forEach((segment, index) => {
      let start = getTimecode(segment.start);
      let end = getTimecode(segment.end);
  
      vttContent += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`;
    });
  
    let vttBlob = new Blob([vttContent], {type: 'text/plain'});
    let url = URL.createObjectURL(vttBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.vtt`;
    link.click();
}
  
