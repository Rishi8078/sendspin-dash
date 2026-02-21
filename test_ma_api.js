/**
 * End-to-end test simulating exactly what the HA proxy + app.js pipeline does.
 * 
 * Step 1: Simulate the Python proxy (POST to MA JSON-RPC API)
 * Step 2: Simulate the JS filter (filter by player_id prefix)
 */

const TOKEN = "Yn7Iy9j6epAQbm_ZLtpmmZg8u9FwK1xhU6s4gXvMjF5BmoQUOBb2iX-pkAbadhpG";
const MA_URL = "http://192.168.0.109:8095";

async function test() {
    console.log("=== Step 1: Simulating Python proxy (POST to MA /api) ===");

    const headers = { "Content-Type": "application/json" };
    headers["Authorization"] = `Bearer ${TOKEN}`;

    const res = await fetch(`${MA_URL}/api`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message_id: 1, command: "players/all" })
    });

    console.log("HTTP Status:", res.status);
    if (!res.ok) {
        console.error("FAIL: MA returned", res.status, res.statusText);
        return;
    }

    const data = await res.json();
    console.log("Raw response type:", typeof data, Array.isArray(data) ? "(array)" : "(object)");
    console.log("Raw response length:", Array.isArray(data) ? data.length : Object.keys(data).length);

    console.log("\n=== Step 2: Simulating app.js filter (Object.values + startsWith) ===");

    // This is EXACTLY what app.js line 77-79 does:
    const browsers = Object.values(data).filter(p =>
        p.player_id && p.player_id.startsWith("sendspin-browser-")
    );

    console.log("Filtered browsers count:", browsers.length);

    if (browsers.length === 0) {
        console.log("RESULT: 'No registered browsers yet.' (EMPTY!)");

        // Debug: show all player_ids to understand why filter failed
        console.log("\nDEBUG: All player IDs in response:");
        Object.values(data).forEach((p, i) => {
            console.log(`  [${i}] player_id: "${p.player_id}" | startsWith check: ${p.player_id && p.player_id.startsWith("sendspin-browser-")}`);
        });
    } else {
        console.log("SUCCESS! Found browsers:");
        browsers.forEach(b => {
            console.log(`  - ${b.name} (${b.player_id}) state=${b.state}`);
        });
    }
}

test().catch(console.error);
