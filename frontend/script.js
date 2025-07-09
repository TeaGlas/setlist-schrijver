document.getElementById("booklet_mode").addEventListener("change", (e) => {
  const value = e.target.value;
  document.getElementById("booklet_only_input").style.display =
    value === "only" ? "block" : "none";
  document.getElementById("booklet_each_input").style.display =
    value === "each" ? "block" : "none";
});

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);

  const res = await fetch("https://<your-backend-url>/process", {
    method: "POST",
    body: data,
  });

  const result = await res.json();
  const list = document.getElementById("results");
  list.innerHTML = "";
  result.songs.forEach((song) => {
    const li = document.createElement("li");
    li.textContent = `${song.number} - ${song.title} (${song.language}, booklet ${song.booklet})`;
    list.appendChild(li);
  });
});
