
const reference = document.getElementById("reference");
const drawing = document.getElementById("drawing");
const outline = document.getElementById("outline");
const fill = document.getElementById("fill");
const replayButton = document.getElementById("replay");

let runId = 0;
let activeAnimations = [];
let fillTimer = null;

function resetAnimation() {
    runId++;

    activeAnimations.forEach(animation => {
        try {
            animation.cancel();
        } catch (error) {
            // Ignore animations that have already finished.
        }
    });

    activeAnimations = [];

    if (fillTimer !== null) {
        clearTimeout(fillTimer);
        fillTimer = null;
    }

    outline.replaceChildren();
    fill.replaceChildren();

    outline.style.clipPath = "none";
    fill.style.opacity = "0";

    return runId;
}

function getFillColor(path) {
    const style = path.getAttribute("style") || "";
    const attribute = path.getAttribute("fill");

    const match = style.match(/fill\s*:\s*([^;]+)/i);

    return (
        attribute ||
        (match ? match[1] : "") ||
        ""
    ).trim().toLowerCase();
}

function isDarkColor(color) {
    if (!color || color === "none" || color === "transparent") {
        return false;
    }

    if (color === "black") {
        return true;
    }

    if (color.startsWith("#")) {
        let hex = color.slice(1);

        if (hex.length === 3) {
            hex = [...hex].map(c => c + c).join("");
        }

        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);

            return (
                0.299 * r +
                0.587 * g +
                0.114 * b
            ) < 150;
        }
    }

    const rgb = color.match(
        /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/
    );

    if (rgb) {
        const r = Number(rgb[1]);
        const g = Number(rgb[2]);
        const b = Number(rgb[3]);

        return (
            0.299 * r +
            0.587 * g +
            0.114 * b
        ) < 150;
    }

    return false;
}

function createSvgPath(d, parent, solid = false) {
    const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
    );

    path.setAttribute("d", d);

    if (solid) {
        path.setAttribute("fill", "#000");
        path.setAttribute("stroke", "none");
        path.setAttribute("fill-rule", "evenodd");
    } else {
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#000");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
    }

    parent.appendChild(path);

    return path;
}

function animateOutline(paths, currentRun) {
    const items = [];

    // Create outline paths and measure their positions.
    for (const source of paths) {
        const d = source.getAttribute("d");

        if (!d) continue;

        const path = createSvgPath(d, outline);

        try {
            const bounds = path.getBBox();
            const length = path.getTotalLength();

            if (!Number.isFinite(length) || length <= 0) {
                path.remove();
                continue;
            }

            path.style.strokeDasharray = String(length);
            path.style.strokeDashoffset = String(length);

            items.push({
                d,
                path,
                top: bounds.y,
                length
            });
        } catch (error) {
            path.remove();
        }
    }

    // Approximate a top-to-bottom drawing order.
    items.sort((a, b) => a.top - b.top);

    if (items.length === 0) {
        alert("No drawable paths were found in the reference image.");
        return;
    }

    let index = 0;

    function drawNext() {
        if (currentRun !== runId) return;

        if (index >= items.length) {
            revealBlackFill(items, currentRun);
            return;
        }

        const item = items[index++];

        const duration = Math.max(
            1000,
            Math.min(6000, item.length * 5)
        );

        const animation = item.path.animate(
            [
                { strokeDashoffset: item.length },
                { strokeDashoffset: 0 }
            ],
            {
                duration,
                easing: "linear",
                fill: "forwards"
            }
        );

        activeAnimations.push(animation);

        animation.finished
            .then(() => {
                if (currentRun === runId) {
                    drawNext();
                }
            })
            .catch(() => {
                // Canceled animations do not continue the sequence.
            });
    }

    drawNext();
}

function revealBlackFill(items, currentRun) {
    if (currentRun !== runId) return;

    fill.replaceChildren();

    // Recreate the detected regions as solid black shapes.
    for (const item of items) {
        createSvgPath(item.d, fill, true);
    }

    fill.style.opacity = "0";

    // Allow the browser to render the initial opacity first.
    requestAnimationFrame(() => {
        if (currentRun !== runId) return;

        fill.style.transition = "opacity 1800ms ease-in-out";
        fill.style.opacity = "1";
    });
}

function startAnimation() {
    const currentRun = resetAnimation();

    if (!reference || !drawing || !outline || !fill) {
        alert("Required HTML elements are missing. Check index.html.");
        return;
    }

    if (!reference.complete || !reference.naturalWidth) {
        alert("Reference image is not loaded. Check assets/reference.jpg.");
        return;
    }

    if (typeof ImageTracer === "undefined") {
        alert(
            "ImageTracer did not load. Check your internet connection and index.html."
        );
        return;
    }

    ImageTracer.imageToSVG(
        reference.src,
        svgText => {
            if (currentRun !== runId) return;

            const parsed = new DOMParser().parseFromString(
                svgText,
                "image/svg+xml"
            );

            if (parsed.querySelector("parsererror")) {
                alert("The reference image could not be converted to SVG.");
                return;
            }

            const sourceSvg = parsed.documentElement;

            const viewBox =
                sourceSvg.getAttribute("viewBox") ||
                `0 0 ${reference.naturalWidth} ${reference.naturalHeight}`;

            drawing.setAttribute("viewBox", viewBox);
            drawing.setAttribute(
                "preserveAspectRatio",
                "xMidYMid meet"
            );

            const sourcePaths = [
                ...sourceSvg.querySelectorAll("path")
            ];

            const darkPaths = sourcePaths.filter(path =>
                isDarkColor(getFillColor(path))
            );

            if (darkPaths.length === 0) {
                alert(
                    "No dark shapes detected. Make sure reference.jpg is the solid-black image, then try again."
                );
                return;
            }

            animateOutline(darkPaths, currentRun);
        },
        {
            numberofcolors: 2,
            colorsampling: 0,
            mincolorratio: 0,
            ltres: 1,
            qtres: 1,
            pathomit: 2,
            scale: 1,
            viewbox: true,
            blurradius: 0,
            blurdelta: 0
        }
    );
}

if (reference) {
    reference.addEventListener("load", startAnimation);

    reference.addEventListener("error", () => {
        alert(
            "Could not load assets/reference.jpg. Check the filename and folder."
        );
    });

    if (reference.complete && reference.naturalWidth > 0) {
        startAnimation();
    }
}

if (replayButton) {
    replayButton.addEventListener("click", startAnimation);
}