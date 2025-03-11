import { Browser, DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import UserAgent from "user-agents";
import { Server } from "proxy-chain";
import { IGpassword, IGusername } from "../secret";
import logger from "../config/logger";
import { Instagram_cookiesExist, loadCookies, saveCookies } from "../utils";
import { runAgent } from "../Agent";
import { getInstagramCommentSchema } from "../Agent/schema";
import fs from 'fs/promises';

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());
puppeteer.use(
  AdblockerPlugin({
    // Optionally enable Cooperative Mode for several request interceptors
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  })
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Follow Limit Logic ---
const FOLLOW_LIMIT_FILE = "./data/follow_limit.json";
const DAILY_FOLLOW_LIMIT = parseInt(process.env.DAILY_FOLLOW_LIMIT || "50", 10);

interface FollowLimitData {
    count: number;
    timestamp: number;
}

async function getFollowLimitData(): Promise<FollowLimitData> {
  try {
    const data = await fs.readFile(FOLLOW_LIMIT_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File doesn't exist, return default values
      return { count: 0, timestamp: Date.now() };
    }
    logger.error(`Error reading follow limit data: ${error}`);
    return {count: 0, timestamp: Date.now()}; //Return default, so it does not crash
  }
}

async function updateFollowLimitData(data: FollowLimitData): Promise<void> {
    try {
        await fs.writeFile(FOLLOW_LIMIT_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch(error) {
        logger.error(`Error writing follow limit data: ${error}`);
    }
}

async function resetDailyFollowCountIfNeeded() {
    const { count, timestamp } = await getFollowLimitData();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // One day in milliseconds

    if (now - timestamp > oneDay) {
        // Reset the count and update the timestamp
        await updateFollowLimitData({ count: 0, timestamp: now });
        logger.info("Daily follow count reset.");
    }
}

// --- End Follow Limit Logic ---

async function runInstagram() {
  const server = new Server({ port: 8000 });
  await server.listen();
  const proxyUrl = `http://localhost:8000`;
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--proxy-server=${proxyUrl}`],
  });

    const page = await browser.newPage();
    const cookiesPath = "./cookies/Instagramcookies.json";

    const checkCookies = await Instagram_cookiesExist();
    logger.info(`Checking cookies existence: ${checkCookies}`);

    if (checkCookies) {
        const cookies = await loadCookies(cookiesPath);
        await page.setCookie(...cookies);
        logger.info('Cookies loaded and set on the page.');

        // Navigate to Instagram to verify if cookies are valid
        await page.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });

        // Check if login was successful by verifying page content (e.g., user profile or feed)
        const isLoggedIn = await page.$("a[href='/direct/inbox/']");
        if (isLoggedIn) {
            logger.info("Login verified with cookies.");
        } else {
            logger.warn("Cookies invalid or expired. Logging in again...");
            await loginWithCredentials(page, browser);
        }
    } else {
        // If no cookies are available, perform login with credentials
        await loginWithCredentials(page, browser);
    }

    // Optionally take a screenshot after loading the page
    await page.screenshot({ path: "logged_in.png" });

    // Navigate to the Instagram homepage
    await page.goto("https://www.instagram.com/");

    // Continuously interact with posts without closing the browser
    while (true) {
         await interactWithPosts(page);
         logger.info("Iteration complete, waiting 30 seconds before refreshing...");
         await delay(30000);
         try {
             await page.reload({ waitUntil: "networkidle2" });
         } catch (e) {
             logger.warn("Error reloading page, continuing iteration: " + e);
         }
    }
}

const loginWithCredentials = async (page: any, browser: Browser) => {
    try {
        await page.goto("https://www.instagram.com/accounts/login/");
        await page.waitForSelector('input[name="username"]');

        // Fill out the login form
        await page.type('input[name="username"]', IGusername); // Replace with your username
        await page.type('input[name="password"]', IGpassword); // Replace with your password
        await page.click('button[type="submit"]');

        // Wait for navigation after login
        await page.waitForNavigation();

        // Save cookies after login
        const cookies = await browser.cookies();
        // logger.info("Saving cookies after login...",cookies);
        await saveCookies("./cookies/Instagramcookies.json", cookies);
    } catch (error) {
        // logger.error("Error logging in with credentials:", error);
        logger.error("Error logging in with credentials:");
    }
}

async function interactWithPosts(page: any) {
    let postIndex = 1; // Start with the first post
    const maxPosts = 50; // Limit to prevent infinite scrolling

    while (postIndex <= maxPosts) {
        try {
            const postSelector = `article:nth-of-type(${postIndex})`;

            // Check if the post exists
            if (!(await page.$(postSelector))) {
                console.log("No more posts found. Ending iteration...");
                return;
            }

            const likeButtonSelector = `${postSelector} svg[aria-label="Like"]`;
            const likeButton = await page.$(likeButtonSelector);
            const ariaLabel = await likeButton?.evaluate((el: Element) =>
                el.getAttribute("aria-label")
            );

            if (ariaLabel === "Like") {
                console.log(`Liking post ${postIndex}...`);
                await likeButton.click();
                await page.keyboard.press("Enter");
                console.log(`Post ${postIndex} liked.`);
            } else if (ariaLabel === "Unlike") {
                console.log(`Post ${postIndex} is already liked.`);
            } else {
                console.log(`Like button not found for post ${postIndex}.`);
            }

            // Extract and log the post caption
            const captionSelector = `${postSelector} div.x9f619 span._ap3a div span._ap3a`;
            const captionElement = await page.$(captionSelector);

            let caption = "";
            if (captionElement) {
                caption = await captionElement.evaluate((el: HTMLElement) => el.innerText);
                console.log(`Caption for post ${postIndex}: ${caption}`);
            } else {
                console.log(`No caption found for post ${postIndex}.`);
            }

            // Check if there is a '...more' link to expand the caption
            const moreLinkSelector = `${postSelector} div.x9f619 span._ap3a span div span.x1lliihq`;
            const moreLink = await page.$(moreLinkSelector);
            if (moreLink) {
                console.log(`Expanding caption for post ${postIndex}...`);
                await moreLink.click();
                const expandedCaption = await captionElement.evaluate(
                    (el: HTMLElement) => el.innerText
                );
                console.log(`Expanded Caption for post ${postIndex}: ${expandedCaption}`);
                caption = expandedCaption;
            }

            // Comment on the post
            const commentBoxSelector = `${postSelector} textarea`;
            const commentBox = await page.$(commentBoxSelector);
            if (commentBox) {
                console.log(`Commenting on post ${postIndex}...`);
                const prompt = `Craft a thoughtful, engaging, and mature reply to the following post: "${caption}". Ensure the reply is relevant, insightful, and adds value to the conversation. It should reflect empathy and professionalism, and avoid sounding too casual or superficial. also it should be 300 characters or less. and it should not go against instagram Community Standards on spam. so you will have to try your best to humanize the reply`;
                const schema = getInstagramCommentSchema();
                const result = await runAgent(schema, prompt);
                const comment = result[0]?.comment;
                await commentBox.type(comment);

                // New selector approach for the post button
                const postButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                    return buttons.find(button => button.textContent === 'Post' && !button.hasAttribute('disabled'));
                });

                if (postButton) {
                    console.log(`Posting comment on post ${postIndex}...`);
                    await postButton.click();
                    console.log(`Comment posted on post ${postIndex}.`);
                } else {
                    console.log("Post button not found.");
                }
            } else {
                console.log("Comment box not found.");
            }

            // Wait before moving to the next post
            const waitTime = Math.floor(Math.random() * 5000) + 5000;
            console.log(`Waiting ${waitTime / 1000} seconds before moving to the next post...`);
            await delay(waitTime);

      // Follow user (add logic here)
      try {
        await resetDailyFollowCountIfNeeded();
        const { count: currentFollowCount } = await getFollowLimitData();

        if (currentFollowCount < DAILY_FOLLOW_LIMIT) {
          const followButtonSelector = `${postSelector} button`; // This is a generic selector, needs refinement
          const followButton = await page.$(followButtonSelector);

          if (followButton) {
            const buttonText = await followButton.evaluate(
              (el: HTMLElement) => el.innerText
            );

            // Check if the button text indicates we can follow the user
            if (buttonText === "Follow" || buttonText === "Follow Back") {
              console.log(`Following user from post ${postIndex}...`);
              await followButton.click();
              console.log("User followed.");

              // Increment follow count
              await updateFollowLimitData({
                count: currentFollowCount + 1,
                timestamp: (await getFollowLimitData()).timestamp, //Keep the old timestamp
              });
            } else {
              console.log(
                `Already following user or button text is unexpected: ${buttonText}`
              );
            }
          } else {
            console.log(`Follow button not found for post ${postIndex}.`);
          }
        } else {
          console.log(`Daily follow limit reached (${DAILY_FOLLOW_LIMIT}).`);
        }
      } catch (followError) {
        console.error(`Error following user from post ${postIndex}:`, followError);
      }

      // Scroll to the next post
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });

            postIndex++;
        } catch (error) {
            console.error(`Error interacting with post ${postIndex}:`, error);
            break;
        }
    }
}

export { runInstagram };
