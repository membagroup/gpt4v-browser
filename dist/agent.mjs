'use client'

// agent.ts
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// helpers.ts
import fs from "fs";
async function image_to_base64(image_file) {
  return await new Promise((resolve, reject) => {
    fs.readFile(image_file, (err, data) => {
      if (err) {
        console.error("Error reading the file:", err);
        reject();
        return;
      }
      const base64Data = data.toString("base64");
      const dataURI = `data:image/jpeg;base64,${base64Data}`;
      resolve(dataURI);
    });
  });
}
async function sleep(milliseconds) {
  return await new Promise((r, _) => {
    setTimeout(() => {
      r(true);
    }, milliseconds);
  });
}
async function waitForEvent(page, event) {
  return page.evaluate((event2) => {
    return new Promise((r, _) => {
      document.addEventListener(event2, function(e) {
        r(true);
      });
    });
  }, event);
}
async function highlight_links(page) {
  await page.evaluate(() => {
    document.querySelectorAll("[gpt-link-text]").forEach((e) => {
      e.removeAttribute("gpt-link-text");
    });
  });
  const elements = await page.$$(
    "a, button, input, textarea, [role=button], [role=treeitem]"
  );
  elements.forEach(async (e) => {
    await page.evaluate((e2) => {
      function isElementVisible(el) {
        if (!el)
          return false;
        function isStyleVisible(el2) {
          const style = window.getComputedStyle(el2);
          return style.width !== "0" && style.height !== "0" && style.opacity !== "0" && style.display !== "none" && style.visibility !== "hidden";
        }
        function isElementInViewport(el2) {
          const rect = el2.getBoundingClientRect();
          return rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);
        }
        if (!isStyleVisible(el)) {
          return false;
        }
        let parent = el;
        while (parent) {
          if (!isStyleVisible(parent)) {
            return false;
          }
          parent = parent.parentElement;
        }
        return isElementInViewport(el);
      }
      e2.style.border = "1px solid red";
      const position = e2.getBoundingClientRect();
      if (position.width > 5 && position.height > 5 && isElementVisible(e2)) {
        const link_text = e2.textContent.replace(/[^a-zA-Z0-9 ]/g, "");
        e2.setAttribute("gpt-link-text", link_text);
      }
    }, e);
  });
}
var tryParse = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    return false;
  }
};

// agent.ts
dotenv.config();
puppeteer.use(StealthPlugin());
var openai = new OpenAI();
var timeout = 5e3;
var systemMessage = {
  "role": "system",
  "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

    You can go to a specific URL by answering with the following JSON format:
    {"url": "url goes here"}

    You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
    {"click": "Text in link"}

    You can scroll down on the website, by answering in the following JSON format:
    {"scroll": "down"}

    Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

    Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`
};
var messages = [];
var scrollAndScreenshot = async (page) => {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  let currentHeight = 0, previousHeight = 0, canScroll = true, lastResponse = "";
  await highlight_links(page);
  while (currentHeight < totalHeight) {
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(1e3);
    currentHeight = await page.evaluate(() => window.scrollY + window.innerHeight);
    if (currentHeight > previousHeight) {
      await page.screenshot({
        // // will capture a 150x100 pixel area starting from the point (50, 100) on the webpage 
        // clip: {
        //     x: 50, // X coordinate of the top-left corner of the area
        //     y: 100, // Y coordinate of the top-left corner of the area
        //     width: 150, // Width of the area to capture
        //     height: 100 // Height of the area to capture
        // },
        path: "screenshot.jpg",
        quality: 100
        // fullPage: true,
      });
      console.log(`Took screenshot at height: ${currentHeight}`);
      await addScreenshotMessage();
      lastResponse = await askAiForAnswer();
      const response = tryParse(lastResponse);
      if (response && response?.scroll) {
        canScroll = true;
      }
    }
    if (currentHeight >= totalHeight && lastResponse.includes("scroll")) {
      messages.push({
        "role": "assistant",
        //"user"
        "content": "ERROR: I was unable to find the answer to your question. Please try asking again or rephrasing your question."
      });
    }
  }
};
var addScreenshotMessage = async () => {
  const base64_image = await image_to_base64("screenshot.jpg");
  messages.push({
    "role": "user",
    "content": JSON.stringify([
      {
        "type": "image_url",
        "image_url": base64_image
      },
      {
        "type": "text",
        "text": `Here's the screenshot of the website you are on right now. You can click on links with {"click": "Link text"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally. If you don't find the answer on this portion of the website, you can scroll down and for another screenshot.`
      }
    ])
  });
};
var browsePageForAnswer = async (page, url) => {
  if (typeof url === "string" && url.length > 0) {
    console.log("Crawling " + url);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout
    });
    await Promise.race([
      waitForEvent(page, "load"),
      sleep(timeout)
    ]);
  }
  await scrollAndScreenshot(page);
};
var askAiForAnswer = async () => {
  messages = messages?.length <= 4 ? messages : [...messages.slice(0, 2), ...messages.slice(-2)];
  console.log("Messages:", JSON.stringify(messages, null, 2));
  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    max_tokens: 1024,
    // max_tokens: 100, //model's response will be limited to 100 tokens.
    messages
    // G2: send system message and last 2 messages (turns)
  });
  const message = response.choices[0].message;
  const message_text = (message?.content || "").trim();
  messages.push({
    "role": "assistant",
    "content": message_text
  });
  return message_text;
};
var runAgent = async (prompt, options) => {
  console.log("###########################################");
  console.log("# GPT4V-Browsing by Unconventional Coding #");
  console.log("###########################################\n");
  let url, agent_done = false, messages2 = [systemMessage];
  messages2.push({
    "role": "user",
    "content": prompt
  });
  const browser = await puppeteer.launch({
    headless: "new",
    // headless: true,
    ...options
  });
  const page = await browser.newPage();
  page.on("console", async (msg) => {
    const msgArgs = msg.args();
    for (let i = 0; i < msgArgs.length; ++i) {
      console.log(await msgArgs[i].jsonValue());
    }
  });
  await page.setViewport({
    width: 1200,
    height: 1200,
    deviceScaleFactor: 1
  });
  while (!agent_done) {
    if (url) {
      await browsePageForAnswer(page, url);
    }
    const aiResponse = await askAiForAnswer();
    if (aiResponse.includes("click")) {
      const resp = tryParse(aiResponse);
      if (resp) {
        const link = resp.click;
        console.log("Clicking on " + link);
        try {
          const elements = await page.$$("[gpt-link-text]");
          let partial, exact;
          for (const element of elements) {
            const attributeValue = await element.evaluate((el) => el.getAttribute("gpt-link-text"));
            if (attributeValue?.includes(link)) {
              partial = element;
            }
            if (attributeValue === link) {
              exact = element;
            }
          }
          if (exact || partial) {
            const [response] = await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch((e) => console.log("Navigation timeout/error:", e.message)),
              (exact || partial).click()
            ]);
            url = true;
          } else {
            throw new Error("Can't find link");
          }
        } catch (error) {
          console.log("ERROR: Clicking failed", error);
          messages2.push({
            "role": "assistant",
            //"user"
            "content": "ERROR: I was unable to click that element"
          });
        }
      }
      url = null;
    } else if (aiResponse.includes("url")) {
      const resp = tryParse(aiResponse);
      url = resp ? resp?.url : null;
    }
    if (!url) {
      agent_done = true;
      prompt = "";
      console.log("Agent done...");
    }
  }
};
var agent_default = runAgent;
export {
  agent_default as default
};
