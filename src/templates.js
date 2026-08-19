// Same five starter templates as the Mac and Linux apps (plain .tex, so the
// text is just copied verbatim rather than fetched from anywhere).
export const TEMPLATES = {
  article: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Untitled Document}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Start writing here.

\\end{document}
`,
  report: `\\documentclass[11pt]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Untitled Report}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents

\\chapter{Introduction}

Start writing here.

\\end{document}
`,
  beamer: `\\documentclass{beamer}
\\usetheme{Madrid}

\\title{Untitled Presentation}
\\author{}
\\date{\\today}

\\begin{document}

\\frame{\\titlepage}

\\begin{frame}{Outline}
  \\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
  \\begin{itemize}
    \\item First point
    \\item Second point
    \\item Third point
  \\end{itemize}
\\end{frame}

\\end{document}
`,
  cv: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=0.9in]{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\pagestyle{empty}

\\begin{document}

\\begin{center}
    {\\LARGE \\textbf{Your Name}}\\\\[4pt]
    email@example.com \\quad | \\quad (000) 000-0000 \\quad | \\quad City, Country
\\end{center}

\\section*{Education}
\\textbf{Degree}, Institution \\hfill Year -- Year\\\\
Relevant coursework, honors, etc.

\\section*{Experience}
\\textbf{Job Title}, Company \\hfill Year -- Year
\\begin{itemize}[leftmargin=1.2em]
    \\item Accomplishment or responsibility.
    \\item Accomplishment or responsibility.
\\end{itemize}

\\section*{Skills}
List of skills, tools, and technologies.

\\end{document}
`,
  example: `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}

\\title{An Example Article}
\\author{Maziar}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
This is an example project showing a few common \\LaTeX{} features: sections,
math, and lists.

\\section{Mathematics}
Euler's identity is often cited as an example of deep mathematical beauty:
\\[
    e^{i\\pi} + 1 = 0
\\]

\\section{Lists}
\\begin{itemize}
    \\item First item
    \\item Second item
    \\begin{enumerate}
        \\item Nested item
        \\item Another nested item
    \\end{enumerate}
\\end{itemize}

\\end{document}
`,
};

export const TEMPLATE_LABELS = {
  article: "Article",
  report: "Report",
  beamer: "Beamer (Slides)",
  cv: "CV",
  example: "Example",
};
