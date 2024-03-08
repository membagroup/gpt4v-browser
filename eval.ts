import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
// import readline from 'readline';
import * as dotenv from 'dotenv';
import { waitForEvent, image_to_base64, sleep, highlight_links as highlightLinks, tryParse, askAiForAnswer } from './helpers';

dotenv.config();

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const prompt = process.argv[2];

(async () => {
    const base64_image = await image_to_base64("screenshot.jpg");
    // https://community.openai.com/t/hitting-rate-limit-on-gpt-4-vision-preview-with-first-query/479464
    const messages = [{
        "role": "user",
        "content": JSON.stringify([
            {
                "type": "image_url",
                "image_url": base64_image,
            },
            {
                "type": "text",
                "text": "what text can you extract from this image",
            }
        ])
    }];

    const aiResponse = await askAiForAnswer(openai, messages);
    console.log(aiResponse);
})();