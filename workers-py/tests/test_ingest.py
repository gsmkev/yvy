import httpx

from yvy_workers.ingest import IngestClient, chunks, sign


def test_firma_igual_al_worker():
    # Vector calculado con node:crypto, igual que src/lib/crypto.ts (hmacHex)
    assert sign("s3cret", 1700000000000, "POST", "/ingest/scenes", '{"a":1}') == "9ddf516132603ec1ce701a5e283f9d3e29dda616ec8928ab75d5d11795f75b9f"


def test_lotes_de_40():
    assert [len(b) for b in chunks(range(95))] == [40, 40, 15]


def test_cliente_firma_y_parte_en_lotes():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        ts = req.headers["x-yvy-timestamp"]
        body = req.content.decode()
        assert req.headers["x-yvy-signature"] == sign("k", int(ts), req.method, req.url.path, body)
        seen.append(len(httpx.Response(200, content=req.content).json()["rows"]))
        return httpx.Response(200, json={"written": seen[-1], "unknownPlots": []})

    c = IngestClient("https://api.test", "k", httpx.Client(transport=httpx.MockTransport(handler)))
    assert c.plot_index_stats({"plotId": str(i)} for i in range(85)) == 85
    assert seen == [40, 40, 5]
