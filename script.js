// Kijk of een 
// Wacht tot het document klaar is
document.addEventListener("DOMContentLoaded", () => {
  // Bestand kiezen en bestandsnaam tonen
  const fileInput = document.getElementById("file_input");
  const fileNameDisplay = document.getElementById("file_name_display");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file ? file.name : "Nog geen bestand gekozen"; // Tekst veranderen naar file naam als die is gekozen
  });

  // Toon invoerveld voor kerstliedjesaantal als 'ja' gekozen is
  document
    .getElementById("include_christmas")
    .addEventListener("change", (e) => {
      const christmasInputRow = document.getElementById(
        "christmas_count_input"
      );
      christmasInputRow.classList.toggle("d-none", e.target.value !== "yes");
    });

  // Toon extra invoerveld afhankelijk van geselecteerde boekjesoptie
  const bookletSelect = document.querySelector("select[name='booklet_option']");
  bookletSelect.addEventListener("change", (e) => {
    const bookletOnlyRow = document.getElementById("booklet_only_input");
    const bookletEachRow = document.getElementById("booklet_each_input");
    bookletOnlyRow.classList.add("d-none");
    bookletEachRow.classList.add("d-none");
    if (e.target.value === "one_booklet")
      bookletOnlyRow.classList.remove("d-none");
    if (e.target.value === "each") bookletEachRow.classList.remove("d-none");
  });

  // Verwerk formulier en genereer selectie
  document.getElementById("song_form").addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Haal bestand op en lees Excel
    const file = fileInput.files[0];
    if (!file) return alert("Kies een Excel-bestand."); // Als file niet is geupload dan een alert
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // 2. Haal formuliervelden op
    const form = new FormData(e.target);
    const total_songs = parseInt(form.get("total_songs"));
    const minDutch = parseInt(form.get("min_dutch") || "0");
    const minEnglish = parseInt(form.get("min_english") || "0");
    const minGerman = parseInt(form.get("min_german") || "0");
    const includeChristmas = form.get("include_christmas") === "yes";
    const christmasCount = includeChristmas
      ? parseInt(form.get("christmas_count") || "0")
      : 0;
    const bookletOption = form.get("booklet_option");
    const onlyBookletNumber = form.get("only_booklet_count");
    const eachBookletCount = parseInt(form.get("each_booklet_count") || "0");
    const excludeNumbers = (form.get("exclude_numbers") || "")
      .split(",")
      .map((x) => parseInt(x.trim()))
      .filter((x) => !isNaN(x));

    console.log("🧾 Formulierdata:", {
      total_songs,
      minDutch,
      minEnglish,
      minGerman,
      includeChristmas,
      christmasCount,
      bookletOption,
      onlyBookletNumber,
      eachBookletCount,
      excludeNumbers,
    });

    // 3. Transformeer en filter Excel-gegevens
    const allSongs = rows
      .map((row) => ({
        number: row["Number"],
        title: row["Title"],
        artist: row["Artist"],
        language: (row["Language"] || "").toLowerCase(),
        christmas: String(row["IsChristmas"]).toLowerCase() === "true",
        booklet: row["Booklet"],
      }))
      .filter((s) => !excludeNumbers.includes(s.number))
      .filter((s) => includeChristmas || !s.christmas)
      .filter(
        (s) =>
          bookletOption !== "one_booklet" ||
          String(s.booklet) === String(onlyBookletNumber)
      );

    // 4. Toon foutmelding bij mislukte selectie
    function showFail(reason = "") {
      document.getElementById("results").innerHTML = `
        <div style="color: red; font-weight: bold; padding: 1rem;">
          ❌ Het is niet gelukt om ${total_songs} liedjes te selecteren die voldoen aan alle eisen.<br>
          ${reason ? "➤ " + reason + "<br>" : ""}
          Probeer het opnieuw met ruimere eisen.
        </div>`;
    }

    // 5. Bepaal filterinstellingen
    const filters = {
      total_songs,
      minDutch,
      minEnglish,
      minGerman,
      includeChristmas,
      christmasCount,
      minPerBooklet: bookletOption === "each" ? eachBookletCount : 0,
    };

    // 6. Probeer selectie herhaaldelijk binnen tijdslimiet
    const retryTimeoutMs = 3000;
    async function generate_songs_retry(allSongs, filters, timeoutMs) {
      const startTime = Date.now(); // Starttijd van de poging
      let bestResult = null; // Hier wordt de "beste poging tot nu toe" bewaard

      while (Date.now() - startTime < timeoutMs) {
        // Genereer een selectie
        const { songs, meetsRequirements } = generate_songs(allSongs, filters);

        // Als de selectie aan alle eisen voldoet, geef die direct terug
        if (meetsRequirements) return { songs, meetsRequirements };

        // Anders: kijk of dit beter is dan eerdere mislukte pogingen
        if (!bestResult || songs.length > bestResult.length) bestResult = songs;

        // Korte pauze om de browser niet te blokkeren
        await new Promise((r) => setTimeout(r, 10));
      }

      // Tijd is op: geef beste poging terug, met `meetsRequirements: false`
      return { songs: bestResult || [], meetsRequirements: false };
    }

    // 7. Genereer selectie en toon resultaat
    const resultContainer = document.getElementById("results");
    const { songs: result, meetsRequirements } = await generate_songs_retry(
      allSongs,
      filters,
      retryTimeoutMs
    );

    if (!meetsRequirements)
      return showFail(
        "Niet alle eisen konden worden gehaald. Hier is het best mogelijke resultaat."
      );

    // Sorteer op nummer en toon in tabel
    result.sort((a, b) => a.number - b.number);
    resultContainer.innerHTML = `
      <h2>Resultaat (${result.length} liedjes)</h2>
      <table>
        <tr><th>#</th><th>Titel</th><th>Artiest</th><th>Boekje</th></tr>
        ${result
          .map(
            (s) => `
          <tr>
            <td>${s.number}</td>
            <td>${s.title}</td>
            <td>${s.artist}</td>
            <td>${s.booklet}</td>
          </tr>`
          )
          .join("")}
      </table>`;
  });
});

function generate_songs(allSongs, filters) {
  const {
    total_songs,
    minDutch,
    minEnglish,
    minGerman,
    includeChristmas,
    christmasCount,
    minPerBooklet,
  } = filters;
  let selected = []; // De uiteindelijk geselecteerde liedjes
  let selectedNumbers = new Set(); // Houd bij welke nummers al gekozen zijn

  // Helperfunctie: selecteert N willekeurige unieke liedjes (geen duplicaten)
  function selectRandom(songs, n, alreadySelected) {
    const filtered = songs.filter((s) => !alreadySelected.has(s.number));
    if (filtered.length < n) return null;

    // Fisher-Yates shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    return filtered.slice(0, n);
  }

  // Selecteer minimumaantallen per taal + kerst, stappen gedaan in prioriteit en schaarste
  const steps = [
    {
      label: "german",
      filter: (s) => s.language === "german",
      count: minGerman,
    },
    {
      label: "christmas",
      filter: (s) => s.christmas,
      count: includeChristmas ? christmasCount || 1 : 0, // Als Kerstliedjes er in moeten dan of de minimale hoeveelheid aangegeven OF minimaal 1, anders 0
    },
    { label: "dutch", filter: (s) => s.language === "dutch", count: minDutch },
    {
      label: "english",
      filter: (s) => s.language === "english",
      count: minEnglish,
    },
  ];

  // Kijk naar filters en minimale hoeveelheden per stap en voeg de uitkomsten toe aan selectedSongs
  for (const { filter, count } of steps) {
    if (count > 0) {
      const selectedSongs = selectRandom(
        allSongs.filter(filter),
        count,
        selectedNumbers
      );
      if (selectedSongs) {
        selectedSongs.forEach((s) => {
          selected.push(s);
          selectedNumbers.add(s.number);
        });
      }
    }
  }

  // Boekjes: zorg dat elk boekje minimaal X liedjes heeft
  const booklets = [...new Set(allSongs.map((s) => s.booklet))]; // Check hoeveel boekjes er zijn in Excel

  // Check of er een minimum per boekje is
  if (minPerBooklet > 0) {
    for (const booklet of booklets) {
      // Voor elk boekje kijken of al liedjes in de selectie zitten van dit boekje
      const countInBooklet = selected.filter(
        (s) => s.booklet === booklet
      ).length;

      const need = minPerBooklet - countInBooklet; // Hoeveel heb je nodig per boekje en hoeveel heb je er al
      if (need > 0) {
        // Als nog liedjes nodig zijn van het specifieke boekje
        const songsInBooklet = allSongs.filter(
          (s) => s.booklet === booklet && !selectedNumbers.has(s.number) // Liedje selecteren die in het juiste boekje zit en nog niet geselecteerd is
        );

        const selectedExtra = selectRandom(
          // Random van overgebleven opties tot need is vervuld
          songsInBooklet,
          need,
          selectedNumbers
        );

        if (selectedExtra) {
          // Gelukt met extra nummers? Dan toevoegen aan selectedNumbers
          selectedExtra.forEach((s) => {
            selected.push(s);
            selectedNumbers.add(s.number);
          });
        }
      }
    }
  }

  // Vul aan of snijd af tot exact `total_songs`
  if (selected.length > total_songs) {
    selected = selected.slice(0, total_songs); // Simpel afknippen van extra nummers
  } else if (selected.length < total_songs) {
    // Niet lang genoeg? Dan extra random nummers toevoegen die nog niet zijn geselecteerd
    const filler = selectRandom(
      allSongs.filter((s) => !selectedNumbers.has(s.number)),
      total_songs - selected.length,
      selectedNumbers
    );
    if (filler) {
      filler.forEach((s) => {
        // Voor elk nieuw geselecteerd nummer, toevoegen aan selectedNumbers
        selected.push(s);
        selectedNumbers.add(s.number);
      });
    }
  }

  // Controleer of selectie voldoet aan alle eisen
  const counts = {
    // Maak van elke hoeveelheid van een taal een nummer
    dutch: selected.filter((s) => s.language === "dutch").length,
    english: selected.filter((s) => s.language === "english").length,
    german: selected.filter((s) => s.language === "german").length,
    christmas: selected.filter((s) => s.christmas).length,
  };

  // Check of nummer groter is of gelijk aan het minimum nummer taal of kerst liedjes
  let meetsRequirements =
    counts.dutch >= minDutch &&
    counts.english >= minEnglish &&
    counts.german >= minGerman &&
    (!includeChristmas || counts.christmas >= (christmasCount || 1));

  if (minPerBooklet > 0) {
    for (const booklet of booklets) {
      if (
        selected.filter((s) => s.booklet === booklet).length < minPerBooklet
      ) {
        meetsRequirements = false; // Niet meetsRequirements als niet per boekje het minimum wordt gehaald
        break;
      }
    }
  }

  return { songs: selected, meetsRequirements, counts };
}
