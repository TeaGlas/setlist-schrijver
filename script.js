document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("file_input");
  const fileNameDisplay = document.getElementById("file_name_display");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file ? file.name : "Nog geen bestand gekozen";
  });

  document
    .getElementById("include_christmas")
    .addEventListener("change", (e) => {
      const christmasInputRow = document.getElementById(
        "christmas_count_input"
      );
      christmasInputRow.classList.toggle("d-none", e.target.value !== "yes");
    });

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

  document.getElementById("song_form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const file = document.getElementById("file_input").files[0];
    if (!file) return alert("Kies een Excel-bestand.");

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log("📥 Ingelezen rijen uit Excel:", rows);

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

    const allSongs = rows
      .map((row) => ({
        number: row["Number"],
        title: row["Title"],
        artist: row["Artist"],
        language: (row["Language"] || "").toLowerCase(),
        christmas: (row["IsChristmas"] + "").toLowerCase() === "true",
        booklet: row["Booklet"],
      }))
      .filter((s) => !excludeNumbers.includes(s.number))
      .filter((s) => includeChristmas || !s.christmas)
      .filter((s) =>
        bookletOption === "one_booklet"
          ? String(s.booklet) === String(onlyBookletNumber)
          : true
      );

    console.log("🎼 Beschikbare songs na filters:", allSongs.length);

    function showFail(reason = "") {
      const resultContainer = document.getElementById("results");
      resultContainer.innerHTML = `
      <div style="color: red; font-weight: bold; padding: 1rem;">
        ❌ Het is niet gelukt om ${total_songs} liedjes te selecteren die voldoen aan alle opgegeven eisen (taal, kerst, boekjes, uitsluitingen).<br>
        ${reason ? "➤ " + reason + "<br>" : ""}
        Probeer het opnieuw met ruimere eisen.
      </div>`;
    }

    const resultContainer = document.getElementById("results");

    const filters = {
      total_songs,
      minDutch,
      minEnglish,
      minGerman,
      includeChristmas,
      minPerBooklet: bookletOption === "each" ? eachBookletCount : 0,
    };

    const retryTimeoutMs = 3000; // 3 seconden, pas aan naar wens

    async function generate_songs_retry(allSongs, filters, timeoutMs) {
      const startTime = Date.now();
      let bestResult = null;
      let bestMeets = false;

      while (Date.now() - startTime < timeoutMs) {
        const { songs, meetsRequirements } = generate_songs(allSongs, filters);
        if (meetsRequirements) {
          return { songs, meetsRequirements };
        }
        // Bewaar beste resultaat als het beter is
        if (!bestMeets) {
          bestResult = songs;
          bestMeets = meetsRequirements;
        }
        await new Promise((r) => setTimeout(r, 10)); // korte pauze om UI niet te blokkeren
      }

      return { songs: bestResult || [], meetsRequirements: false };
    }

    const { songs: result, meetsRequirements } = await generate_songs_retry(
      allSongs,
      filters,
      retryTimeoutMs
    );

    if (!meetsRequirements) {
      return showFail(
        "Niet alle eisen konden volledig worden gehaald, hier is het beste resultaat."
      );
    }

    result.sort((a, b) => a.number - b.number);

    resultContainer.innerHTML = `
  <h2>Resultaat (${result.length} liedjes)</h2>
  <table>
    <tr>
      <th>#</th><th>Titel</th><th>Artiest</th><th>Boekje</th>
    </tr>
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
    console.log("✅ Geselecteerde liedjes:", result);
  });
});

function generate_songs(allSongs, filters) {
  const {
    total_songs,
    minDutch,
    minEnglish,
    minGerman,
    includeChristmas,
    minPerBooklet,
  } = filters;

  let selected = [];
  let selectedNumbers = new Set();

  // Helper: selecteer N willekeurige unieke liedjes uit lijst
  function selectRandom(songs, n, alreadySelected) {
    const filtered = songs.filter((s) => !alreadySelected.has(s.number));
    if (filtered.length < n) return null;
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    return filtered.slice(0, n);
  }

  // --- Selecteer minimumaantallen per taal en kerst

  // Duits
  const germanSongs = allSongs.filter((s) => s.language === "german");
  const germanSelected = selectRandom(germanSongs, minGerman, selectedNumbers);
  if (germanSelected) {
    germanSelected.forEach((s) => {
      selected.push(s);
      selectedNumbers.add(s.number);
    });
  }

  // Kerstliedjes
  if (includeChristmas) {
    const christmasSongs = allSongs.filter(
      (s) => s.christmas && !selectedNumbers.has(s.number)
    );
    const minChristmas =
      filters.christmasCount > 0 ? filters.christmasCount : 1;
    const christmasSelected = selectRandom(
      christmasSongs,
      minChristmas,
      selectedNumbers
    );
    if (christmasSelected) {
      christmasSelected.forEach((s) => {
        selected.push(s);
        selectedNumbers.add(s.number);
      });
    }
  }

  // Nederlands
  const dutchSongs = allSongs.filter(
    (s) => s.language === "dutch" && !selectedNumbers.has(s.number)
  );
  const dutchSelected = selectRandom(dutchSongs, minDutch, selectedNumbers);
  if (dutchSelected) {
    dutchSelected.forEach((s) => {
      selected.push(s);
      selectedNumbers.add(s.number);
    });
  }

  // Engels
  const englishSongs = allSongs.filter(
    (s) => s.language === "english" && !selectedNumbers.has(s.number)
  );
  const englishSelected = selectRandom(
    englishSongs,
    minEnglish,
    selectedNumbers
  );
  if (englishSelected) {
    englishSelected.forEach((s) => {
      selected.push(s);
      selectedNumbers.add(s.number);
    });
  }

  // --- Boekjes minimum per boekje
  const booklets = [...new Set(allSongs.map((s) => s.booklet))];
  if (filters.minPerBooklet > 0) {
    for (const booklet of booklets) {
      const countInBooklet = selected.filter(
        (s) => s.booklet === booklet
      ).length;
      const need = minPerBooklet - countInBooklet;
      if (need > 0) {
        const songsInBooklet = allSongs.filter(
          (s) => s.booklet === booklet && !selectedNumbers.has(s.number)
        );
        const selectedFromBooklet = selectRandom(
          songsInBooklet,
          need,
          selectedNumbers
        );
        if (selectedFromBooklet) {
          selectedFromBooklet.forEach((s) => {
            selected.push(s);
            selectedNumbers.add(s.number);
          });
        }
      }
    }
  }

  // --- Nu selected bevat alle minimum eisen, controleer of dit al te veel is:

  if (selected.length > total_songs) {
    // Te veel: we moeten liedjes verwijderen, maar niet onder minimums komen

    // Bereken aantal per categorie
    const counts = {
      dutch: selected.filter((s) => s.language === "dutch").length,
      english: selected.filter((s) => s.language === "english").length,
      german: selected.filter((s) => s.language === "german").length,
      christmas: selected.filter((s) => s.christmas).length,
    };

    // Probeer overbodige liedjes te verwijderen (eerst de extras buiten minimum)
    // Dit is een complexe taak, hier simpel voorbeeld: gewoon afknippen, maar eerst sorteren op prioriteit

    // Sorteer songs: prioriteit = min aantal items behouden, extras op het eind
    // Dus verwijder eerst liedjes die niet nodig zijn voor minimum per taal, kerst, boekje

    // Voor nu: knip gewoon af op total_songs (misschien verbeterbaar)

    selected = selected.slice(0, total_songs);
  } else if (selected.length < total_songs) {
    // Vul aan met willekeurige liedjes
    const leftovers = allSongs.filter((s) => !selectedNumbers.has(s.number));
    const filler = selectRandom(
      leftovers,
      total_songs - selected.length,
      selectedNumbers
    );
    if (filler) {
      filler.forEach((s) => {
        selected.push(s);
        selectedNumbers.add(s.number);
      });
    }
  }

  // --- Controleer of aan eisen voldaan is
  const counts = {
    dutch: selected.filter((s) => s.language === "dutch").length,
    english: selected.filter((s) => s.language === "english").length,
    german: selected.filter((s) => s.language === "german").length,
    christmas: selected.filter((s) => s.christmas).length,
  };
  let meetsRequirements =
    counts.dutch >= minDutch &&
    counts.english >= minEnglish &&
    counts.german >= minGerman &&
    (!includeChristmas ||
      counts.christmas >=
        (filters.christmasCount > 0 ? filters.christmasCount : 1));

  for (const booklet of booklets) {
    const countInBooklet = selected.filter((s) => s.booklet === booklet).length;
    if (countInBooklet < minPerBooklet) {
      meetsRequirements = false;
      break;
    }
  }

  return { songs: selected, meetsRequirements, counts };
}
