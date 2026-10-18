// Entry point of the browser app.
// Stage 0: just a placeholder that points at the design mockup.
// Stage 1 replaces this with the canvas renderer and a live fight.
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="placeholder">
    <h1>Petri</h1>
    <p>Specimen under preparation. Stage 0 of 6.</p>
    <p><a href="${import.meta.env.BASE_URL}mockup.html">View the main-screen design mockup →</a></p>
  </main>
`;
