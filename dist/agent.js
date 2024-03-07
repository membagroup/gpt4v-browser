'use client'
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// agent.ts
var agent_exports = {};
__export(agent_exports, {
  default: () => agent_default
});
module.exports = __toCommonJS(agent_exports);
var import_puppeteer_extra = __toESM(require("puppeteer-extra"));
var import_puppeteer_extra_plugin_stealth = __toESM(require("puppeteer-extra-plugin-stealth"));
var import_openai = __toESM(require("openai"));
var dotenv = __toESM(require("dotenv"));

// helpers.ts
var import_fs = __toESM(require("fs"));
async function image_to_base64(image_file) {
  return await new Promise((resolve, reject) => {
    import_fs.default.readFile(image_file, (err, data) => {
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

// agent.ts
dotenv.config();
import_puppeteer_extra.default.use((0, import_puppeteer_extra_plugin_stealth.default)());
var openai = new import_openai.default();
var timeout = 5e3;
var messages = [
  {
    "role": "system",
    "content": `You are a website crawler. You will be given instructions on what to do by browsing. You are connected to a web browser and you will be given the screenshot of the website you are on. The links on the website will be highlighted in red in the screenshot. Always read what is in the screenshot. Don't guess link names.

        You can go to a specific URL by answering with the following JSON format:
        {"url": "url goes here"}

        You can click links on the website by referencing the text inside of the link/button, by answering in the following JSON format:
        {"click": "Text in link"}

        Once you are on a URL and you have found the answer to the user's question, you can answer with a regular message.

        Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable. Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. Do not make up links`
  }
];
var highlight_screenshot = async (page, prompt, url, goTo = false) => {
  let elemId;
  page.on("console", async (msg) => {
    const msgArgs = msg.args();
    for (let i = 0; i < msgArgs.length; ++i) {
      console.log(await msgArgs[i].jsonValue());
    }
  });
  if (goTo) {
    console.log("Crawling " + url);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout
    });
  }
  await Promise.race([
    waitForEvent(page, "load"),
    sleep(timeout)
  ]);
  const results = await page.evaluate((prompt2) => {
    const words = prompt2.split(" ");
    const grantLinks = Array.from(document.querySelectorAll("a"));
    console.log("Links:", prompt2, words, grantLinks[0]?.innerText);
    let foundLinks = [];
    for (let i = 0; i < words.length; i += 2) {
      const textToFind = words.slice(i, i + 2).join(" ");
      for (let link of grantLinks) {
        if (link.innerText.includes(textToFind)) {
          foundLinks.push(link.id);
        }
      }
    }
    return foundLinks;
  }, prompt);
  elemId = results[0].id;
  console.log("Link Id:", elemId, results[0]);
  await highlight_links(page);
  if (!elemId) {
    await page.screenshot({
      // // will capture a 150x100 pixel area starting from the point (50, 100) on the webpage 
      clip: {
        x: 50,
        // X coordinate of the top-left corner of the area
        y: 100,
        // Y coordinate of the top-left corner of the area
        width: 150,
        // Width of the area to capture
        height: 100
        // Height of the area to capture
      },
      path: "screenshot.jpg",
      quality: 100
      // fullPage: true,
    });
  } else {
    await page.waitForSelector(elemId);
    await page.evaluate(() => {
      document.querySelector("#elementId").scrollIntoView();
    });
    await page.waitForTimeout(1e3);
    const element = await page.$(elemId);
    await element.screenshot({
      path: "screenshot.jpg",
      quality: 100
    });
  }
};
var runAgent = async (prompt, options) => {
  console.log("###########################################");
  console.log("# GPT4V-Browsing by Unconventional Coding #");
  console.log("###########################################\n");
  const browser = await import_puppeteer_extra.default.launch({
    // headless: "new",
    headless: false,
    ...options
    // executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
    // userDataDir: '/Users/<user>/Library/Application\ Support/Google/Chrome\ Canary/Default',
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1200,
    height: 1200,
    deviceScaleFactor: 1
  });
  messages.push({
    "role": "user",
    "content": prompt
  });
  let url, screenshot_taken = false, agent_done = false;
  while (!agent_done) {
    if (url) {
      await highlight_screenshot(page, prompt, url, true);
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
            "image_url": base64_image
          },
          {
            "type": "text",
            "text": `Here's the screenshot of the website you are on right now. You can click on links with {"click": "Link text"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally.`
          }
        ])
      });
      screenshot_taken = false;
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      max_tokens: 1024,
      // max_tokens: 100, //model's response will be limited to 100 tokens.
      messages
    });
    const message = response.choices[0].message;
    const message_text = message.content.trim();
    messages.push({
      "role": "assistant",
      "content": message_text
    });
    console.log(JSON.stringify(messages, null, 2));
    if (message_text.includes("click")) {
      const link_text = JSON.parse(message_text).click;
      console.log("Clicking on " + link_text);
      try {
        const elements = await page.$$("[gpt-link-text]");
        let partial, exact;
        for (const element of elements) {
          const attributeValue = await element.evaluate((el) => el.getAttribute("gpt-link-text"));
          if (attributeValue.includes(link_text)) {
            partial = element;
          }
          if (attributeValue === link_text) {
            exact = element;
          }
        }
        if (exact || partial) {
          const [response2] = await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch((e) => console.log("Navigation timeout/error:", e.message)),
            (exact || partial).click()
          ]);
          await highlight_screenshot(page, prompt);
          screenshot_taken = true;
        } else {
          throw new Error("Can't find link");
        }
      } catch (error) {
        console.log("ERROR: Clicking failed", error);
        messages.push({
          "role": "assistant",
          //"user"
          "content": "ERROR: I was unable to click that element"
        });
      }
      continue;
    } else if (message_text.includes("url")) {
      url = JSON.parse(message_text).url;
      continue;
    }
    agent_done = true;
    prompt = void 0;
  }
};
var agent_default = runAgent;
