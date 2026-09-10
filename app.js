const authArea = document.getElementById("authArea");
const authPanel = document.getElementById("authPanel");
const uploadPanel = document.getElementById("uploadPanel");
const gallery = document.getElementById("gallery");
const cardTemplate = document.getElementById("cardTemplate");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const showLogin = document.getElementById("showLogin");
const showSignup = document.getElementById("showSignup");
const authError = document.getElementById("authError");

const uploadForm = document.getElementById("uploadForm");
const uploadError = document.getElementById("uploadError");

let me = { username: null, isAdmin: false };

showLogin.addEventListener("click", () => {
  showLogin.classList.add("active");
  showSignup.classList.remove("active");
  loginForm.hidden = false;
  signupForm.hidden = true;
  authError.textContent = "";
});

showSignup.addEventListener("click", () => {
  showSignup.classList.add("active");
  showLogin.classList.remove("active");
  signupForm.hidden = false;
  loginForm.hidden = true;
  authError.textContent = "";
});

async function refreshMe() {
  const res = await fetch("/api/me");
  me = await res.json();
  renderAuthArea();
}

function renderAuthArea() {
  authArea.innerHTML = "";
  if (me.username) {
    const span = document.createElement("span");
    span.textContent = `logged in as ${me.username}`;
    const btn = document.createElement("button");
    btn.textContent = "Log out";
    btn.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      await refreshMe();
      renderGallery();
    });
    authArea.append(span, btn);
    authPanel.hidden = true;
    uploadPanel.hidden = false;
  } else {
    const btn = document.createElement("button");
    btn.textContent = "Log in / sign up";
    btn.addEventListener("click", () => {
      authPanel.hidden = !authPanel.hidden;
    });
    authArea.append(btn);
    uploadPanel.hidden = true;
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const data = Object.fromEntries(new FormData(loginForm));
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    authError.textContent = body.error;
    return;
  }
  loginForm.reset();
  authPanel.hidden = true;
  await refreshMe();
  renderGallery();
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  const data = Object.fromEntries(new FormData(signupForm));
  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    authError.textContent = body.error;
    return;
  }
  signupForm.reset();
  authPanel.hidden = true;
  await refreshMe();
  renderGallery();
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  uploadError.textContent = "";
  const formData = new FormData(uploadForm);
  const res = await fetch("/api/images", { method: "POST", body: formData });
  const body = await res.json();
  if (!res.ok) {
    uploadError.textContent = body.error;
    return;
  }
  uploadForm.reset();
  renderGallery();
});

async function renderGallery() {
  const res = await fetch("/api/images");
  const images = await res.json();
  gallery.innerHTML = "";
  for (const img of images) {
    const node = cardTemplate.content.cloneNode(true);
    const imgEl = node.querySelector("img");
    const uploaderEl = node.querySelector(".uploader");
    const deleteBtn = node.querySelector(".deleteBtn");

    imgEl.src = `/api/images/${img.id}/file`;
    imgEl.alt = img.filename;
    uploaderEl.textContent = img.uploader;

    if (me.isAdmin) {
      deleteBtn.hidden = false;
      deleteBtn.addEventListener("click", async () => {
        await fetch(`/api/images/${img.id}`, { method: "DELETE" });
        renderGallery();
      });
    }

    gallery.appendChild(node);
  }
}

(async function init() {
  await refreshMe();
  renderGallery();
})();
