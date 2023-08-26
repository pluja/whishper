/** @type {import('./$types').PageLoad} */
import {getRandomSentence} from "$lib/utils";


export async function load() {
    const randomSentence = getRandomSentence();
    
    return {
        randomSentence: randomSentence
    };
};