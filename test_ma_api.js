const token = "Yn7Iy9j6epAQbm_ZLtpmmZg8u9FwK1xhU6s4gXvMjF5BmoQUOBb2iX-pkAbadhpG";
const maUrl = "http://192.168.0.109:8095";

async function testFetch() {
    try {
        const headers = { "Content-Type": "application/json" };
        headers["Authorization"] = `Bearer ${token}`;

        console.log("Fetching", `${maUrl}/api`);
        const res = await fetch(`${maUrl}/api`, {
            method: "POST",
            headers,
            body: JSON.stringify({ message_id: 1, command: "players/all" })
        });

        console.log("Status:", res.status);
        if (!res.ok) return console.error("Not ok", res.statusText);
        const data = await res.json();
        console.log("Data keys:", Object.keys(data));

        // How is the data structured?
        let players = [];
        if (Array.isArray(data)) {
            players = data;
        } else if (data.result && Array.isArray(data.result)) {
            players = data.result;
        } else if (data.result && typeof data.result === "object") {
            players = Object.values(data.result);
        } else {
            players = Object.values(data);
        }

        const browsers = players.filter(p =>
            p.player_id && p.player_id.startsWith("sendspin-browser-")
        );
        console.log("Found browsers:", browsers.length);
        if (browsers.length > 0) {
            console.log("Browser ID:", browsers[0].player_id);
        }

    } catch (err) {
        console.error("Fetch error:", err);
    }
}

testFetch();
