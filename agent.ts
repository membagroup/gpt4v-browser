import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import OpenAI from 'openai';
// import readline from 'readline';
import * as dotenv from 'dotenv';
import { waitForEvent, image_to_base64, sleep, highlight_links } from './helpers';

dotenv.config();

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const timeout = 5000;
const messages = [
    {
        "role": "system",
        "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

        You can go to a specific URL by answering with the following JSON format:
        {"url": "url goes here"}

        You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
        {"click": "Text in link"}

        Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

        Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`,
    }
];

const runAgent = async (prompt: string) => {
    console.log("###########################################");
    console.log("# GPT4V-Browsing by Unconventional Coding #");
    console.log("###########################################\n");

    const browser = await puppeteer.launch({
        // headless: "new",
        headless: false,
        // executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        // userDataDir: '/Users/jasonzhou/Library/Application\ Support/Google/Chrome\ Canary/Default',
    });

    const page = await browser.newPage();

    await page.setViewport({
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
    });

    // console.log("GPT: How can I assist you today?")
    // const prompt = await input("You: ");
    // console.log();

    messages.push({
        "role": "user",
        "content": prompt,
    });

    let url, screenshot_taken = false, agent_done = false;

    while (!agent_done) {
        if (url) {
            console.log("Crawling " + url);
            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: timeout,
            });

            await Promise.race([
                waitForEvent(page, 'load'),
                sleep(timeout)
            ]);

            await highlight_links(page);

            await page.screenshot({
                path: "screenshot.jpg",
                fullPage: true,
            });

            screenshot_taken = true;
            url = null;
        }

        if (screenshot_taken) {
            const base64_image = await image_to_base64("screenshot.jpg");

            messages.push({
                "role": "user",
                "content": JSON.stringify([
                    {
                        "type": "image_url",
                        "image_url": base64_image,
                    },
                    {
                        "type": "text",
                        "text": "Here's the screenshot of the website you are on right now. You can click on links with {\"click\": \"Link text\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally.",
                    }
                ])
            });

            screenshot_taken = false;
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            max_tokens: 1024,
            messages: messages as any[],
        });

        const message = response.choices[0].message;
        const message_text = message.content;

        messages.push({
            "role": "assistant",
            "content": message_text,
        });

        console.log("GPT: " + message_text);

        if (message_text.indexOf('{"click": "') !== -1) {

            // let parts = message_text.split('{"click": "');
            // parts = parts[1].split('"}');
            // const link_text = parts[0].replace(/[^a-zA-Z0-9 ]/g, '');
            const link_text = JSON.parse(message_text).click;

            console.log("Clicking on " + link_text)

            try {
                const elements = await page.$$('[gpt-link-text]');

                let partial, exact;

                for (const element of elements) {
                    const attributeValue = await element.evaluate(el => el.getAttribute('gpt-link-text'));

                    if (attributeValue.includes(link_text)) {
                        partial = element;
                    }

                    if (attributeValue === link_text) {
                        exact = element;
                    }
                }

                if (exact || partial) {
                    const [response] = await Promise.all([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                            .catch(e => console.log("Navigation timeout/error:", e.message)),
                        (exact || partial).click()
                    ]);

                    // Additional checks can be done here, like validating the response or URL
                    await Promise.race([
                        waitForEvent(page, 'load'),
                        sleep(timeout)
                    ]);

                    await highlight_links(page);

                    await page.screenshot({
                        path: "screenshot.jpg",
                        quality: 100,
                        fullPage: true
                    });

                    screenshot_taken = true;
                } else {
                    throw new Error("Can't find link");
                }
            } catch (error) {
                console.log("ERROR: Clicking failed", error);

                messages.push({
                    "role": "assistant", //"user"
                    "content": "ERROR: I was unable to click that element",
                });
            }

            continue;
        } else if (message_text.indexOf('{"url": "') !== -1) {
            // let parts = message_text.split('{"url": "');
            // parts = parts[1].split('"}');
            // url = parts[0];
            url = JSON.parse(message_text).url;

            continue;
        }

        // const prompt = await input("You: ");
        // console.log();

        // messages.push({
        //     "role": "user",
        //     "content": prompt,
        // });
        agent_done = true;
    }
}

export default runAgent;