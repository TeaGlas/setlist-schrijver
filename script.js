document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("file_input");
  const fileNameDisplay = document.getElementById("file_name_display");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileNameDisplay.textContent = file ? file.name : "Nog geen bestand gekozen";
  });

  document
    .getElementById("include_christmas")
    .addEventListener("change", (e) => {
      const christmasInputRow = document.getElementById("christmas_count_input");
      if (e.target.value === "yes") {
        christmasInputRow.classList.remove("d-none");
      } else {
        christmasInputRow.classList.add("d-none");
      }
    });

  const bookletSelect = document.querySelector("select[name='booklet_option']");
  bookletSelect.addEventListener("change", (e) => {
    const bookletOnlyRow = document.getElementById("booklet_only_input");
    const bookletEachRow = document.getElementById("booklet_each_input");

    if (e.target.value === "one_booklet") {
      bookletOnlyRow.classList.remove("d-none");
      bookletEachRow.classList.add("d-none");
    } else if (e.target.value === "each") {
      bookletOnlyRow.classList.add("d-none");
      bookletEachRow.classList.remove("d-none");
    } else {
      bookletOnlyRow.classList.add("d-none");
      bookletEachRow.classList.add("d-none");
    }
  });

  document.getElementById("song_form").addEventListener("submit", async function (e) {
    e.preventDefault();
    document.getElementById("results").innerHTML = "";

    const file = document.getElementById("file_input").files[0];
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const form = new FormData(e.target);
    const totalSongs = parseInt(form.get("total_songs"));
    const minDutch = parseInt(form.get("min_dutch") || "0");
    const minEnglish = parseInt(form.get("min_english") || "0");
    const minGerman = parseInt(form.get("min_german") || "0");
    const includeChristmas = form.get("include_christmas") === "yes";
    const christmasCount = includeChristmas ? parseInt(form.get("christmas_count") || "0") : 0;
    const bookletOption = form.get("booklet_option");
    const onlyBookletNumber = form.get("only_booklet_count");
    const eachBookletCount = parseInt(form.get("each_booklet_count") || "0");
    const excludeNumbers = (form.get("exclude_numbers") || "")
      .split(",")
      .map((x) => parseInt(x.trim()))
      .filter((x) => !isNaN(x));

    let warnings = [];

    // Normaliseren en filteren
    let songs = rows.map((row) => ({
      number: row["Number"],
      title: row["Title"],
      artist: row["Artist"],
      language: (row["Language"] || "").toLowerCase(),
      christmas: (row["IsChristmas"] + "").toLowerCase() === "true",
      booklet: row["Booklet"],
    }));

    songs = songs.filter((s) => !excludeNumbers.includes(s.number));
    if (!includeChristmas) {
      songs = songs.filter((s) => !s.christmas);
    }

    // Boekje-filter vooraf
    if (bookletOption === "one_booklet" && onlyBookletNumber) {
      songs = songs.filter((s) => String(s.booklet) === String(onlyBookletNumber));
    }

    let result = [];

    const pickSongs = (filterFn, n, pool) => {
      const candidates = pool.filter(filterFn);
      if (candidates.length < n) {
        warnings.push(`Gevraagd ${n} liedjes, maar slechts ${candidates.length} beschikbaar voor een bepaalde filter.`);
      }
      return candidates
        .sort(() => 0.5 - Math.random())
        .slice(0, n);
    };

    let remainingPool = [...songs];

    // Boekje per stuk
    if (bookletOption === "each" && eachBookletCount > 0) {
      const uniqueBooklets = [...new Set(remainingPool.map((s) => s.booklet))];

      for (let b of uniqueBooklets) {
        const bookletPool = remainingPool.filter((s) => s.booklet === b);
        let selected = [];

        // Taal binnen dit boekje
        const dutch = pickSongs((s) => s.language === "dutch", minDutch, bookletPool);
        selected.push(...dutch);

        const english = pickSongs((s) => s.language === "english", minEnglish, bookletPool);
        selected.push(...english);

        const german = pickSongs((s) => s.language === "german", minGerman, bookletPool);
        selected.push(...german);

        // Opvullen
        const filler = pickSongs(
          (s) => !selected.includes(s),
          eachBookletCount - selected.length,
          bookletPool
        );
        selected.push(...filler);

        result.push(...selected);
        remainingPool = remainingPool.filter((s) => !selected.includes(s));
      }
    } else {
      // Taalfilters los
      const dutch = pickSongs((s) => s.language === "dutch", minDutch, remainingPool);
      result.push(...dutch);
      remainingPool = remainingPool.filter((s) => !dutch.includes(s));

      const english = pickSongs((s) => s.language === "english", minEnglish, remainingPool);
      result.push(...english);
      remainingPool = remainingPool.filter((s) => !english.includes(s));

      const german = pickSongs((s) => s.language === "german", minGerman, remainingPool);
      result.push(...german);
      remainingPool = remainingPool.filter((s) => !german.includes(s));
    }

    // Kerst
    if (includeChristmas) {
      const christmas = pickSongs((s) => s.christmas, christmasCount, remainingPool);
      result.push(...christmas);
      remainingPool = remainingPool.filter((s) => !christmas.includes(s));
    }

    // Opvullen tot totaal
    const stillNeeded = totalSongs - result.length;
    if (stillNeeded > 0) {
      const filler = remainingPool.sort(() => 0.5 - Math.random()).slice(0, stillNeeded);
      result.push(...filler);
    }

    // Finaliseren
    result = result.slice(0, totalSongs);
    result.sort((a, b) => Number(a.number) - Number(b.number));

    let html = `<h2>Resultaat (${result.length} liedjes)</h2>`;
    if (warnings.length > 0) {
      html += `<div class="warning"><strong>Let op:</strong><ul>${warnings
        .map((w) => `<li>${w}</li>`)
        .join("")}</ul></div>`;
    }

    html += `
      <table>
        <tr><th>#</th><th>Titel</th><th>Artiest</th><th>Taal</th><th>Kerst</th><th>Boekje</th></tr>
        ${result
          .map(
            (s) =>
              `<tr><td>${s.number}</td><td>${s.title}</td><td>${s.artist}</td><td>${s.language}</td><td>${
                s.christmas ? "🎄" : ""
              }</td><td>${s.booklet}</td></tr>`
          )
          .join("")}
      </table>
    `;

    document.getElementById("results").innerHTML = html;
  });
});
