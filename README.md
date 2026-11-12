# MakeItCount modok a Claude Code-hoz

Két mod az AI Challenge résztvevőinek. A mod a Claude Code kinézetét és működését változtatja: panelt, sávot, saját parancsot ad, vagy megállít egy lépést. A Claude Code terminálos változatában, a Claude asztali app Code fülén és a VS Code-bővítményben működik.

## A két mod

### MIC Piaci műszerfal (`mic-piaci-muszerfal`)

- **Sáv a beviteli mező fölött:** S&P 500, Nasdaq-100, VIX és Bitcoin, napi változással. 5 percenként frissül, a „Frissít” gomb azonnal frissít.
- **`/piac` parancs:** panel valós napi gyertyás charttal (S&P 500, félvezető index, Bitcoin, VIX), egy kattintással megnyitható TradingView-ban.
- **Riasztás:** értesítés, ha a Bitcoin 24 óra alatt 5%-nál többet esik, vagy a VIX 25 fölé megy.
- **`/hangulat` parancs:** a MIC hangulat-index panelben, mutatóval és idősorral. Az indexet a `hangulat-index` skill számolja a projektmappádban (`hangulat/hangulat-index.json`), a mod csak megjeleníti.

Adat kulcs nélkül: a CNBC nyilvános árfolyam- és chart-végpontja, valamint a Binance nyilvános API-ja. Ezek nem hivatalos, nem garantált szolgáltatások: ha egyszer nem válaszolnak, a sáv hibát ír ki, és a következő frissítésnél újrapróbálja.

### MIC Kulcs-őr (`mic-kulcs-or`)

- A Claude nem olvashatja, nem írhatja és nem küldheti fel a `.env` fájlt (a `.env.minta` és a `.env.example` kivétel, azokban nincs valódi kulcs).
- Nem enged olyan parancsot, ami a `.env` tartalmát kiírná vagy elvinné, és nem engedi a `.env` GitHubra küldését.
- Ha a promptodban kulcsnak látszó szöveg van, a prompt el sem megy, és figyelmeztetést kapsz.
- Macen, Linuxon és Windowson is működik: a 0.2.0 verzió óta a Windows fordított perjeles útvonalát (`C:\...\.env`), a PowerShellt és a keresőt (Grep) is figyeli, és a `.ENV` írásmódot is felismeri. Ha a 0.1.0 van fent nálad, frissíts (lent).

A kulcs-őr egy plusz biztonsági öv, nem garancia. A szabály marad: kulcsot soha ne írj a chatbe, a `.env` fájlt te töltöd ki, saját kezűleg.

## Telepítés

**Az asztali appban (Code fül):** bal oldalt Customize, fent Plugins, jobbra + Add, majd Add from a repository, és add meg ezt: `sulczgabor/mic-claude-modok`. Utána válaszd ki a modot.

**Terminálban, a Claude Code promptjánál:**

```
/plugin marketplace add sulczgabor/mic-claude-modok
/plugin install mic-piaci-muszerfal@mic-modok
/plugin install mic-kulcs-or@mic-modok
```

**Shellből:**

```
claude plugin marketplace add sulczgabor/mic-claude-modok
claude plugin install mic-piaci-muszerfal@mic-modok
claude plugin install mic-kulcs-or@mic-modok
```

## Frissítés

Shellből (vagy kérd meg a Claude-ot, hogy futtassa le), utána indítsd újra a Claude Code-ot:

```
claude plugin marketplace update mic-modok
claude plugin update mic-kulcs-or@mic-modok
```

## Mielőtt bármilyen modot telepítesz

A modok nem futnak elzárt környezetben: a te gépeden, a te jogaiddal futnak. Ezért ugyanaz a szabály, mint az idegen skillnél: telepítés előtt kérd meg a Claude-ot, hogy olvassa el a kódot, és mondja el, mit csinál, hova kapcsolódik, és mihez fér hozzá. Ezt a két modot is nyugodtan olvastasd el.

Kikapcsolás: a Plugins menüben, vagy egy munkamenetre a `--safe-mode` kapcsolóval.

## Felelősség

Oktatási eszköz. Nem befektetési tanács, nem ajánlás, és nem jóslat. Az adatok késhetnek vagy hibásak lehetnek, döntés előtt mindig nézd meg az eredeti forrást.

MakeItCount, AI Challenge, 2026.
