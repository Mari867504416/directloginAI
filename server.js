const express = require("express");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const app = express();

const PORT = process.env.PORT || 10000;

const USER_DATA_DIR = path.join(
    __dirname,
    "auth",
    "user-data"
);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

let browserContext = null;
let page = null;
let startingBrowser = null;


/* =========================================================
   START GEMINI BROWSER
========================================================= */

async function startGeminiBrowser() {

    if (page && !page.isClosed()) {
        return page;
    }

    if (startingBrowser) {
        return startingBrowser;
    }

    startingBrowser = (async () => {

        console.log("Starting Chromium...");

        fs.mkdirSync(USER_DATA_DIR, {
            recursive: true
        });

        browserContext = await chromium.launchPersistentContext(
            USER_DATA_DIR,
            {
                headless: true,

                viewport: {
                    width: 1440,
                    height: 900
                },

                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu"
                ]
            }
        );

        page = await browserContext.newPage();

        console.log("Opening Gemini...");

        await page.goto(
            "https://gemini.google.com/app",
            {
                waitUntil: "domcontentloaded",
                timeout: 120000
            }
        );

        console.log(
            "Gemini page loaded:",
            await page.title()
        );

        return page;
    })();

    try {
        return await startingBrowser;
    } finally {
        startingBrowser = null;
    }
}


/* =========================================================
   LOGIN STATUS
========================================================= */

app.get("/gemini-status", async (req, res) => {

    try {

        const geminiPage = await startGeminiBrowser();

        await geminiPage.waitForTimeout(3000);

        const url = geminiPage.url();

        const title = await geminiPage.title();

        const loginRequired =
            url.includes("accounts.google.com") ||
            (
                await geminiPage.locator(
                    'input[type="email"]'
                ).count()
            ) > 0;

        res.json({
            success: true,
            loggedIn: !loginRequired,
            url,
            title
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


/* =========================================================
   ASK GEMINI
========================================================= */

app.post("/ask", async (req, res) => {

    try {

        const question = String(
            req.body.question || ""
        ).trim();

        if (!question) {

            return res.status(400).json({
                success: false,
                error: "Question is required"
            });
        }

        console.log("\n================================");
        console.log("Question:", question);
        console.log("================================");


        const geminiPage = await startGeminiBrowser();


        /* -----------------------------------------
           CHECK LOGIN
        ----------------------------------------- */

        if (
            geminiPage.url().includes(
                "accounts.google.com"
            )
        ) {

            return res.status(401).json({
                success: false,
                loginRequired: true,
                error:
                    "Google login is required. Login once in the browser session."
            });
        }


        /* -----------------------------------------
           OPEN GEMINI
        ----------------------------------------- */

        if (
            !geminiPage.url().includes(
                "gemini.google.com"
            )
        ) {

            await geminiPage.goto(
                "https://gemini.google.com/app",
                {
                    waitUntil: "domcontentloaded",
                    timeout: 120000
                }
            );
        }


        await geminiPage.waitForTimeout(2000);


        /* -----------------------------------------
           FIND TEXTAREA
        ----------------------------------------- */

        const inputSelectors = [
            "textarea",
            '[contenteditable="true"]',
            'div[role="textbox"]'
        ];

        let input = null;

        for (const selector of inputSelectors) {

            const locator =
                geminiPage.locator(selector).last();

            if (
                await locator.count() > 0 &&
                await locator.isVisible().catch(() => false)
            ) {

                input = locator;

                console.log(
                    "Input found:",
                    selector
                );

                break;
            }
        }


        if (!input) {

            return res.status(500).json({
                success: false,
                loginRequired: true,
                error:
                    "Gemini input box was not found. Gemini UI may have changed."
            });
        }


        /* -----------------------------------------
           TYPE QUESTION
        ----------------------------------------- */

        await input.click();

        await input.fill(question);


        /* -----------------------------------------
           SEND
        ----------------------------------------- */

        const sendSelectors = [
            'button[aria-label*="Send"]',
            'button[aria-label*="send"]',
            'button:has-text("Send")',
            '[data-testid*="send"]'
        ];

        let sent = false;

        for (const selector of sendSelectors) {

            const button =
                geminiPage.locator(selector).last();

            if (
                await button.count() > 0 &&
                await button.isVisible().catch(() => false)
            ) {

                await button.click();

                console.log(
                    "Send button clicked:",
                    selector
                );

                sent = true;

                break;
            }
        }


        /* -----------------------------------------
           FALLBACK: ENTER
        ----------------------------------------- */

        if (!sent) {

            console.log(
                "Send button not found. Pressing Enter..."
            );

            await input.press("Enter");
        }


        /* -----------------------------------------
           WAIT FOR GEMINI
        ----------------------------------------- */

        console.log(
            "Waiting for Gemini response..."
        );

        await geminiPage.waitForTimeout(3000);


        /* -----------------------------------------
           GET RESPONSE
        ----------------------------------------- */

        let answer = "";

        for (
            let attempt = 0;
            attempt < 30;
            attempt++
        ) {

            await geminiPage.waitForTimeout(1000);


            /*
             * Gemini's response DOM changes from time
             * to time, therefore several selectors
             * are checked.
             */

            const responseSelectors = [

                "message-content",

                ".model-response-text",

                "[data-message-author-role='model']",

                ".markdown-main-panel",

                "div[class*='response']"
            ];


            for (
                const selector of responseSelectors
            ) {

                const responses =
                    geminiPage.locator(selector);

                const count =
                    await responses.count();

                if (count === 0) {
                    continue;
                }


                const lastResponse =
                    responses.last();


                if (
                    await lastResponse.isVisible()
                        .catch(() => false)
                ) {

                    const text =
                        await lastResponse.innerText()
                            .catch(() => "");

                    if (
                        text &&
                        text.trim().length > 10
                    ) {

                        answer =
                            text.trim();

                        break;
                    }
                }
            }


            if (answer) {
                break;
            }
        }


        /* -----------------------------------------
           FALLBACK RESPONSE EXTRACTION
        ----------------------------------------- */

        if (!answer) {

            answer = await geminiPage
                .locator("body")
                .innerText()
                .catch(() => "");
        }


        if (!answer) {

            return res.status(500).json({
                success: false,
                error:
                    "Gemini response could not be read."
            });
        }


        console.log("\nGemini Answer:\n");

        console.log(answer);


        /* -----------------------------------------
           SEND TO FRONTEND
        ----------------------------------------- */

        res.json({

            success: true,

            question,

            answer,

            timestamp:
                new Date().toISOString()

        });

    } catch (error) {

        console.error(
            "Gemini automation error:",
            error
        );

        res.status(500).json({

            success: false,

            error: error.message

        });
    }
});


/* =========================================================
   HOME
========================================================= */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});


/* =========================================================
   SERVER
========================================================= */

app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});

browserContext = await chromium.launchPersistentContext(
    USER_DATA_DIR,
    {
        headless: true,

        viewport: {
            width: 1440,
            height: 900
        },

        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    }
);
