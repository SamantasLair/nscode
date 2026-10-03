/**
 * Modular Icon Theme System for NSCode Desktop Workbench
 * 
 * Provides type-safe definitions, built-in themes (Seti & Minimal),
 * and a runtime registry for resolving file and folder icons.
 * Zero external runtime dependencies.
 */

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface IconMapping {
  /** CSS class or icon identifier, e.g. 'codicon codicon-file-code file-icon-ts' */
  icon: string;
  /** Associated hex, CSS variable, or theme color */
  color?: string;
  /** Optional secondary or custom CSS class for specialized styling */
  customClass?: string;
  /** Optional font glyph code or character */
  fontCharacter?: string;
}

export interface FolderIconMapping {
  /** Icon class or identifier when folder is closed / collapsed */
  folder: string;
  /** Icon class or identifier when folder is opened / expanded */
  folderExpanded: string;
  /** Optional root folder icon when collapsed */
  rootFolder?: string;
  /** Optional root folder icon when expanded */
  rootFolderExpanded?: string;
  /** Optional color associated with this folder */
  color?: string;
}

export interface IconThemeDefinition {
  /** Unique identifier for the icon theme (e.g. 'seti', 'minimal') */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Description of the icon theme */
  description?: string;
  /** Default fallback icon for files if no specific rule matches */
  defaultFile: IconMapping | string;
  /** Default fallback icon for folders */
  defaultFolder: FolderIconMapping;
  /** Map of specific file names (exact match, case-insensitive) to icon */
  fileNames?: Record<string, IconMapping | string>;
  /** Map of file extensions (without leading dot, case-insensitive) to icon */
  fileExtensions?: Record<string, IconMapping | string>;
  /** Map of specific folder names to folder icon */
  folderNames?: Record<string, FolderIconMapping>;
  /** Map of specific folder names when expanded */
  folderNamesExpanded?: Record<string, string>;
  /** Optional light theme variant overrides */
  light?: Partial<IconThemeDefinition>;
  /** Optional high-contrast theme variant overrides */
  highContrast?: Partial<IconThemeDefinition>;
}

export interface IconThemeChangeEvent {
  previousThemeId: string;
  currentTheme: IconThemeDefinition;
}

export type IconThemeChangeListener = (event: IconThemeChangeEvent) => void;

// ============================================================================
// Built-in Themes: Seti (Standard VS Code / Seti Theme)
// ============================================================================

export const SETI_ICON_THEME: IconThemeDefinition = {
  id: 'seti',
  label: 'Seti (Visual Studio Code)',
  description: 'Standard VS Code / Seti theme mapping with comprehensive extensions and language colors',
  defaultFile: {
    icon: 'codicon codicon-file file-icon-default',
    color: '#d4d4d4'
  },
  defaultFolder: {
    folder: 'codicon codicon-folder',
    folderExpanded: 'codicon codicon-folder-opened',
    color: '#dcb67a'
  },
  folderNames: {
    src: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#519aba' },
    source: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#519aba' },
    dist: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#808080' },
    build: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#808080' },
    out: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#808080' },
    node_modules: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#cb3837' },
    '.git': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#f14e32' },
    '.github': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#f14e32' },
    '.vscode': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#007acc' },
    test: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#8dc149' },
    tests: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#8dc149' },
    __tests__: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#8dc149' },
    docs: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#4d78cc' },
    doc: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#4d78cc' },
    packages: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#ff9900' },
    scripts: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#89e051' },
    public: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#e37933' },
    assets: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened', color: '#a074c4' }
  },
  fileNames: {
    '.gitignore': { icon: 'codicon codicon-source-control file-icon-git', color: '#f14e32' },
    '.gitattributes': { icon: 'codicon codicon-source-control file-icon-git', color: '#f14e32' },
    '.gitmodules': { icon: 'codicon codicon-source-control file-icon-git', color: '#f14e32' },
    'dockerfile': { icon: 'codicon codicon-server-process file-icon-docker', color: '#384d54' },
    '.dockerignore': { icon: 'codicon codicon-server-process file-icon-docker', color: '#384d54' },
    'docker-compose.yml': { icon: 'codicon codicon-server-process file-icon-docker', color: '#384d54' },
    'docker-compose.yaml': { icon: 'codicon codicon-server-process file-icon-docker', color: '#384d54' },
    'package.json': { icon: 'codicon codicon-json file-icon-json file-icon-npm', color: '#cb3837' },
    'package-lock.json': { icon: 'codicon codicon-lock file-icon-lock', color: '#cb3837' },
    'tsconfig.json': { icon: 'codicon codicon-json file-icon-json file-icon-tsconfig', color: '#3178c6' },
    'tsconfig.base.json': { icon: 'codicon codicon-json file-icon-json file-icon-tsconfig', color: '#3178c6' },
    'jsconfig.json': { icon: 'codicon codicon-json file-icon-json file-icon-jsconfig', color: '#cbcb41' },
    'readme.md': { icon: 'codicon codicon-book file-icon-readme', color: '#4d78cc' },
    'readme': { icon: 'codicon codicon-book file-icon-readme', color: '#4d78cc' },
    'changelog.md': { icon: 'codicon codicon-history file-icon-changelog', color: '#519aba' },
    'changelog': { icon: 'codicon codicon-history file-icon-changelog', color: '#519aba' },
    'license': { icon: 'codicon codicon-certificate file-icon-license', color: '#d0bf41' },
    'license.md': { icon: 'codicon codicon-certificate file-icon-license', color: '#d0bf41' },
    'license.txt': { icon: 'codicon codicon-certificate file-icon-license', color: '#d0bf41' },
    '.env': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    '.env.local': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    '.env.development': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    '.env.production': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    '.env.test': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    '.env.example': { icon: 'codicon codicon-gear file-icon-config file-icon-env', color: '#e5b567' },
    'yarn.lock': { icon: 'codicon codicon-lock file-icon-lock file-icon-yarn', color: '#2c8ebb' },
    'pnpm-lock.yaml': { icon: 'codicon codicon-lock file-icon-lock file-icon-pnpm', color: '#f69220' },
    'bun.lockb': { icon: 'codicon codicon-lock file-icon-lock file-icon-bun', color: '#fbf0df' },
    'cargo.toml': { icon: 'codicon codicon-file-code file-icon-rust', color: '#dea584' },
    'cargo.lock': { icon: 'codicon codicon-lock file-icon-lock', color: '#dea584' },
    'go.mod': { icon: 'codicon codicon-file-code file-icon-go', color: '#00add8' },
    'go.sum': { icon: 'codicon codicon-lock file-icon-lock', color: '#00add8' },
    'gemfile': { icon: 'codicon codicon-file-code file-icon-ruby', color: '#701516' },
    'gemfile.lock': { icon: 'codicon codicon-lock file-icon-lock', color: '#701516' },
    'composer.json': { icon: 'codicon codicon-json file-icon-php', color: '#4f5d95' },
    'composer.lock': { icon: 'codicon codicon-lock file-icon-lock', color: '#4f5d95' },
    'requirements.txt': { icon: 'codicon codicon-file-text file-icon-python', color: '#3572a5' },
    'pyproject.toml': { icon: 'codicon codicon-file-code file-icon-python', color: '#3572a5' },
    'makefile': { icon: 'codicon codicon-terminal file-icon-make', color: '#e37933' },
    'cmakelists.txt': { icon: 'codicon codicon-file-code file-icon-cmake', color: '#064f8c' },
    'vite.config.ts': { icon: 'codicon codicon-file-code file-icon-vite', color: '#646cff' },
    'vite.config.js': { icon: 'codicon codicon-file-code file-icon-vite', color: '#646cff' },
    'webpack.config.js': { icon: 'codicon codicon-file-code file-icon-webpack', color: '#8dd6f9' },
    'rollup.config.js': { icon: 'codicon codicon-file-code file-icon-rollup', color: '#ec4a3f' },
    'tailwind.config.js': { icon: 'codicon codicon-file-code file-icon-tailwind', color: '#38bdf8' },
    'tailwind.config.ts': { icon: 'codicon codicon-file-code file-icon-tailwind', color: '#38bdf8' },
    'eslint.config.js': { icon: 'codicon codicon-file-code file-icon-eslint', color: '#4b32c3' },
    'eslint.config.mjs': { icon: 'codicon codicon-file-code file-icon-eslint', color: '#4b32c3' },
    '.eslintrc': { icon: 'codicon codicon-json file-icon-eslint', color: '#4b32c3' },
    '.eslintrc.json': { icon: 'codicon codicon-json file-icon-eslint', color: '#4b32c3' },
    '.eslintrc.js': { icon: 'codicon codicon-file-code file-icon-eslint', color: '#4b32c3' },
    '.prettierrc': { icon: 'codicon codicon-json file-icon-prettier', color: '#56b3b4' },
    '.prettierrc.json': { icon: 'codicon codicon-json file-icon-prettier', color: '#56b3b4' },
    '.editorconfig': { icon: 'codicon codicon-gear file-icon-config', color: '#e0e0e0' },
    'procfile': { icon: 'codicon codicon-server-process file-icon-procfile', color: '#79589f' },
    'favicon.ico': { icon: 'codicon codicon-file-media file-icon-media', color: '#cbcb41' }
  },
  fileExtensions: {
    // TypeScript & JavaScript
    ts: { icon: 'codicon codicon-file-code file-icon-ts', color: '#3178c6' },
    tsx: { icon: 'codicon codicon-file-code file-icon-react', color: '#61dafb' },
    js: { icon: 'codicon codicon-file-code file-icon-js', color: '#cbcb41' },
    jsx: { icon: 'codicon codicon-file-code file-icon-react', color: '#61dafb' },
    mjs: { icon: 'codicon codicon-file-code file-icon-js', color: '#cbcb41' },
    cjs: { icon: 'codicon codicon-file-code file-icon-js', color: '#cbcb41' },
    // Python
    py: { icon: 'codicon codicon-python file-icon-python', color: '#3572a5' },
    pyw: { icon: 'codicon codicon-python file-icon-python', color: '#3572a5' },
    pyi: { icon: 'codicon codicon-python file-icon-python', color: '#3572a5' },
    pyc: { icon: 'codicon codicon-file-binary file-icon-python', color: '#519aba' },
    // Systems & Native
    rs: { icon: 'codicon codicon-file-code file-icon-rust', color: '#dea584' },
    go: { icon: 'codicon codicon-file-code file-icon-go', color: '#00add8' },
    c: { icon: 'codicon codicon-file-code file-icon-c', color: '#555555' },
    h: { icon: 'codicon codicon-file-code file-icon-c file-icon-header', color: '#a074c4' },
    cpp: { icon: 'codicon codicon-file-code file-icon-cpp', color: '#f34b7d' },
    cc: { icon: 'codicon codicon-file-code file-icon-cpp', color: '#f34b7d' },
    cxx: { icon: 'codicon codicon-file-code file-icon-cpp', color: '#f34b7d' },
    hpp: { icon: 'codicon codicon-file-code file-icon-cpp file-icon-header', color: '#a074c4' },
    hxx: { icon: 'codicon codicon-file-code file-icon-cpp file-icon-header', color: '#a074c4' },
    cs: { icon: 'codicon codicon-file-code file-icon-csharp', color: '#178600' },
    java: { icon: 'codicon codicon-file-code file-icon-java', color: '#b07219' },
    class: { icon: 'codicon codicon-file-binary file-icon-java', color: '#b07219' },
    jar: { icon: 'codicon codicon-file-zip file-icon-java', color: '#b07219' },
    kt: { icon: 'codicon codicon-file-code file-icon-kotlin', color: '#a97bff' },
    kts: { icon: 'codicon codicon-file-code file-icon-kotlin', color: '#a97bff' },
    php: { icon: 'codicon codicon-file-code file-icon-php', color: '#4f5d95' },
    phtml: { icon: 'codicon codicon-file-code file-icon-php', color: '#4f5d95' },
    rb: { icon: 'codicon codicon-file-code file-icon-ruby', color: '#701516' },
    erb: { icon: 'codicon codicon-file-code file-icon-ruby', color: '#701516' },
    swift: { icon: 'codicon codicon-file-code file-icon-swift', color: '#ffac45' },
    zig: { icon: 'codicon codicon-file-code file-icon-zig', color: '#ec915c' },
    // Web & Markup
    html: { icon: 'codicon codicon-file-code file-icon-html', color: '#e34c26' },
    htm: { icon: 'codicon codicon-file-code file-icon-html', color: '#e34c26' },
    css: { icon: 'codicon codicon-file-code file-icon-css', color: '#563d7c' },
    scss: { icon: 'codicon codicon-file-code file-icon-css file-icon-scss', color: '#c6538c' },
    sass: { icon: 'codicon codicon-file-code file-icon-css file-icon-sass', color: '#c6538c' },
    less: { icon: 'codicon codicon-file-code file-icon-css file-icon-less', color: '#1d365d' },
    vue: { icon: 'codicon codicon-file-code file-icon-vue', color: '#41b883' },
    svelte: { icon: 'codicon codicon-file-code file-icon-svelte', color: '#ff3e00' },
    astro: { icon: 'codicon codicon-file-code file-icon-astro', color: '#ff5d01' },
    // Markdown & Documentation
    md: { icon: 'codicon codicon-markdown file-icon-markdown', color: '#519aba' },
    markdown: { icon: 'codicon codicon-markdown file-icon-markdown', color: '#519aba' },
    mdown: { icon: 'codicon codicon-markdown file-icon-markdown', color: '#519aba' },
    txt: { icon: 'codicon codicon-file-text file-icon-txt', color: '#6d8086' },
    log: { icon: 'codicon codicon-file-text file-icon-txt', color: '#6d8086' },
    // Data & Configuration
    json: { icon: 'codicon codicon-json file-icon-json', color: '#cbcb41' },
    jsonc: { icon: 'codicon codicon-json file-icon-json', color: '#cbcb41' },
    yaml: { icon: 'codicon codicon-file-code file-icon-yaml', color: '#cb171e' },
    yml: { icon: 'codicon codicon-file-code file-icon-yaml', color: '#cb171e' },
    toml: { icon: 'codicon codicon-file-code file-icon-toml', color: '#9c4221' },
    xml: { icon: 'codicon codicon-file-code file-icon-xml', color: '#e37933' },
    xsd: { icon: 'codicon codicon-file-code file-icon-xml', color: '#e37933' },
    ini: { icon: 'codicon codicon-gear file-icon-config', color: '#e5b567' },
    cfg: { icon: 'codicon codicon-gear file-icon-config', color: '#e5b567' },
    conf: { icon: 'codicon codicon-gear file-icon-config', color: '#e5b567' },
    proto: { icon: 'codicon codicon-file-code file-icon-proto', color: '#00979d' },
    graphql: { icon: 'codicon codicon-file-code file-icon-graphql', color: '#e535ab' },
    gql: { icon: 'codicon codicon-file-code file-icon-graphql', color: '#e535ab' },
    // Shell & Terminal
    sh: { icon: 'codicon codicon-terminal-bash file-icon-shell', color: '#89e051' },
    bash: { icon: 'codicon codicon-terminal-bash file-icon-shell', color: '#89e051' },
    zsh: { icon: 'codicon codicon-terminal-bash file-icon-shell', color: '#89e051' },
    ps1: { icon: 'codicon codicon-terminal-powershell file-icon-powershell', color: '#012456' },
    psm1: { icon: 'codicon codicon-terminal-powershell file-icon-powershell', color: '#012456' },
    psd1: { icon: 'codicon codicon-terminal-powershell file-icon-powershell', color: '#012456' },
    bat: { icon: 'codicon codicon-terminal file-icon-shell', color: '#c1f12e' },
    cmd: { icon: 'codicon codicon-terminal file-icon-shell', color: '#c1f12e' },
    // Databases
    sql: { icon: 'codicon codicon-database file-icon-sql', color: '#e38c00' },
    db: { icon: 'codicon codicon-database file-icon-db', color: '#dad8d8' },
    sqlite: { icon: 'codicon codicon-database file-icon-db', color: '#dad8d8' },
    sqlite3: { icon: 'codicon codicon-database file-icon-db', color: '#dad8d8' },
    // Media & Visuals
    png: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    jpg: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    jpeg: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    gif: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    webp: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    ico: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    bmp: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    tiff: { icon: 'codicon codicon-file-media file-icon-media', color: '#a074c4' },
    svg: { icon: 'codicon codicon-file-media file-icon-svg', color: '#ff9900' },
    mp3: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    wav: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    ogg: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    flac: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    mp4: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    mkv: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    webm: { icon: 'codicon codicon-file-media file-icon-media', color: '#d35400' },
    // Archives
    zip: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    tar: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    gz: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    '7z': { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    rar: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    bz2: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    xz: { icon: 'codicon codicon-file-zip file-icon-zip', color: '#cca700' },
    // Documents & Binaries
    pdf: { icon: 'codicon codicon-file-pdf file-icon-pdf', color: '#b30b00' },
    wasm: { icon: 'codicon codicon-file-binary file-icon-wasm', color: '#654ff0' },
    wat: { icon: 'codicon codicon-file-code file-icon-wasm', color: '#654ff0' },
    exe: { icon: 'codicon codicon-file-binary file-icon-binary', color: '#e5e5e5' },
    dll: { icon: 'codicon codicon-file-binary file-icon-binary', color: '#e5e5e5' },
    so: { icon: 'codicon codicon-file-binary file-icon-binary', color: '#e5e5e5' },
    dylib: { icon: 'codicon codicon-file-binary file-icon-binary', color: '#e5e5e5' },
    bin: { icon: 'codicon codicon-file-binary file-icon-binary', color: '#e5e5e5' },
    // Other Languages
    dart: { icon: 'codicon codicon-file-code file-icon-dart', color: '#00b4ab' },
    lua: { icon: 'codicon codicon-file-code file-icon-lua', color: '#000080' },
    r: { icon: 'codicon codicon-file-code file-icon-r', color: '#198ce7' },
    rmd: { icon: 'codicon codicon-file-code file-icon-r', color: '#198ce7' },
    pl: { icon: 'codicon codicon-file-code file-icon-perl', color: '#0298c3' },
    pm: { icon: 'codicon codicon-file-code file-icon-perl', color: '#0298c3' },
    hs: { icon: 'codicon codicon-file-code file-icon-haskell', color: '#5e5086' },
    scala: { icon: 'codicon codicon-file-code file-icon-scala', color: '#dc322f' },
    clj: { icon: 'codicon codicon-file-code file-icon-clojure', color: '#63b132' },
    ex: { icon: 'codicon codicon-file-code file-icon-elixir', color: '#6e4a7e' },
    erl: { icon: 'codicon codicon-file-code file-icon-erlang', color: '#b83998' },
    jl: { icon: 'codicon codicon-file-code file-icon-julia', color: '#a270ba' },
    lock: { icon: 'codicon codicon-lock file-icon-lock', color: '#bbbbbb' },
    diff: { icon: 'codicon codicon-diff file-icon-diff', color: '#41535b' },
    patch: { icon: 'codicon codicon-diff file-icon-diff', color: '#41535b' },
    ttf: { icon: 'codicon codicon-file-binary file-icon-font', color: '#ff2c70' },
    woff: { icon: 'codicon codicon-file-binary file-icon-font', color: '#ff2c70' },
    woff2: { icon: 'codicon codicon-file-binary file-icon-font', color: '#ff2c70' }
  }
};

// ============================================================================
// Built-in Themes: Minimal (Clean Monochromatic Theme)
// ============================================================================

export const MINIMAL_ICON_THEME: IconThemeDefinition = {
  id: 'minimal',
  label: 'Minimal (Monochrome)',
  description: 'Clean monochromatic theme with functional icons and no colored accents',
  defaultFile: {
    icon: 'codicon codicon-file'
  },
  defaultFolder: {
    folder: 'codicon codicon-folder',
    folderExpanded: 'codicon codicon-folder-opened'
  },
  folderNames: {
    src: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    dist: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    build: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    node_modules: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    '.git': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    '.github': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    '.vscode': { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    test: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    tests: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' },
    docs: { folder: 'codicon codicon-folder', folderExpanded: 'codicon codicon-folder-opened' }
  },
  fileNames: {
    '.gitignore': { icon: 'codicon codicon-source-control' },
    '.gitattributes': { icon: 'codicon codicon-source-control' },
    '.gitmodules': { icon: 'codicon codicon-source-control' },
    'dockerfile': { icon: 'codicon codicon-server-process' },
    '.dockerignore': { icon: 'codicon codicon-server-process' },
    'docker-compose.yml': { icon: 'codicon codicon-server-process' },
    'docker-compose.yaml': { icon: 'codicon codicon-server-process' },
    'package.json': { icon: 'codicon codicon-json' },
    'package-lock.json': { icon: 'codicon codicon-lock' },
    'tsconfig.json': { icon: 'codicon codicon-json' },
    'tsconfig.base.json': { icon: 'codicon codicon-json' },
    'jsconfig.json': { icon: 'codicon codicon-json' },
    'readme.md': { icon: 'codicon codicon-markdown' },
    'readme': { icon: 'codicon codicon-file-text' },
    'changelog.md': { icon: 'codicon codicon-markdown' },
    'changelog': { icon: 'codicon codicon-file-text' },
    'license': { icon: 'codicon codicon-certificate' },
    'license.md': { icon: 'codicon codicon-certificate' },
    'license.txt': { icon: 'codicon codicon-certificate' },
    '.env': { icon: 'codicon codicon-gear' },
    '.env.local': { icon: 'codicon codicon-gear' },
    '.env.development': { icon: 'codicon codicon-gear' },
    '.env.production': { icon: 'codicon codicon-gear' },
    '.env.test': { icon: 'codicon codicon-gear' },
    'yarn.lock': { icon: 'codicon codicon-lock' },
    'pnpm-lock.yaml': { icon: 'codicon codicon-lock' },
    'cargo.lock': { icon: 'codicon codicon-lock' },
    'go.sum': { icon: 'codicon codicon-lock' }
  },
  fileExtensions: {
    // Code
    ts: { icon: 'codicon codicon-file-code' },
    tsx: { icon: 'codicon codicon-file-code' },
    js: { icon: 'codicon codicon-file-code' },
    jsx: { icon: 'codicon codicon-file-code' },
    mjs: { icon: 'codicon codicon-file-code' },
    cjs: { icon: 'codicon codicon-file-code' },
    py: { icon: 'codicon codicon-file-code' },
    pyw: { icon: 'codicon codicon-file-code' },
    rs: { icon: 'codicon codicon-file-code' },
    go: { icon: 'codicon codicon-file-code' },
    c: { icon: 'codicon codicon-file-code' },
    h: { icon: 'codicon codicon-file-code' },
    cpp: { icon: 'codicon codicon-file-code' },
    cc: { icon: 'codicon codicon-file-code' },
    cxx: { icon: 'codicon codicon-file-code' },
    hpp: { icon: 'codicon codicon-file-code' },
    cs: { icon: 'codicon codicon-file-code' },
    java: { icon: 'codicon codicon-file-code' },
    kt: { icon: 'codicon codicon-file-code' },
    php: { icon: 'codicon codicon-file-code' },
    rb: { icon: 'codicon codicon-file-code' },
    swift: { icon: 'codicon codicon-file-code' },
    html: { icon: 'codicon codicon-file-code' },
    htm: { icon: 'codicon codicon-file-code' },
    css: { icon: 'codicon codicon-file-code' },
    scss: { icon: 'codicon codicon-file-code' },
    sass: { icon: 'codicon codicon-file-code' },
    less: { icon: 'codicon codicon-file-code' },
    vue: { icon: 'codicon codicon-file-code' },
    svelte: { icon: 'codicon codicon-file-code' },
    astro: { icon: 'codicon codicon-file-code' },
    dart: { icon: 'codicon codicon-file-code' },
    lua: { icon: 'codicon codicon-file-code' },
    zig: { icon: 'codicon codicon-file-code' },
    // Documentation & Text
    md: { icon: 'codicon codicon-markdown' },
    markdown: { icon: 'codicon codicon-markdown' },
    txt: { icon: 'codicon codicon-file-text' },
    log: { icon: 'codicon codicon-file-text' },
    // Config & Data
    json: { icon: 'codicon codicon-json' },
    jsonc: { icon: 'codicon codicon-json' },
    yaml: { icon: 'codicon codicon-file-code' },
    yml: { icon: 'codicon codicon-file-code' },
    toml: { icon: 'codicon codicon-file-code' },
    xml: { icon: 'codicon codicon-file-code' },
    ini: { icon: 'codicon codicon-gear' },
    cfg: { icon: 'codicon codicon-gear' },
    conf: { icon: 'codicon codicon-gear' },
    // Shell
    sh: { icon: 'codicon codicon-terminal-bash' },
    bash: { icon: 'codicon codicon-terminal-bash' },
    zsh: { icon: 'codicon codicon-terminal-bash' },
    ps1: { icon: 'codicon codicon-terminal-powershell' },
    bat: { icon: 'codicon codicon-terminal' },
    cmd: { icon: 'codicon codicon-terminal' },
    // Databases
    sql: { icon: 'codicon codicon-database' },
    db: { icon: 'codicon codicon-database' },
    sqlite: { icon: 'codicon codicon-database' },
    sqlite3: { icon: 'codicon codicon-database' },
    // Media
    png: { icon: 'codicon codicon-file-media' },
    jpg: { icon: 'codicon codicon-file-media' },
    jpeg: { icon: 'codicon codicon-file-media' },
    gif: { icon: 'codicon codicon-file-media' },
    webp: { icon: 'codicon codicon-file-media' },
    ico: { icon: 'codicon codicon-file-media' },
    svg: { icon: 'codicon codicon-file-media' },
    mp3: { icon: 'codicon codicon-file-media' },
    mp4: { icon: 'codicon codicon-file-media' },
    // Archives & Documents
    zip: { icon: 'codicon codicon-file-zip' },
    tar: { icon: 'codicon codicon-file-zip' },
    gz: { icon: 'codicon codicon-file-zip' },
    '7z': { icon: 'codicon codicon-file-zip' },
    rar: { icon: 'codicon codicon-file-zip' },
    pdf: { icon: 'codicon codicon-file-pdf' },
    wasm: { icon: 'codicon codicon-file-binary' },
    exe: { icon: 'codicon codicon-file-binary' },
    dll: { icon: 'codicon codicon-file-binary' },
    diff: { icon: 'codicon codicon-diff' },
    lock: { icon: 'codicon codicon-lock' }
  }
};

// ============================================================================
// Icon Theme Registry
// ============================================================================

export class IconThemeRegistry {
  private readonly themes = new Map<string, IconThemeDefinition>();
  private activeThemeId = 'seti';
  private readonly listeners = new Set<IconThemeChangeListener>();

  constructor(initialThemeId: string = 'seti') {
    // Register built-in default themes
    this.registerTheme(SETI_ICON_THEME);
    this.registerTheme(MINIMAL_ICON_THEME);

    if (this.themes.has(initialThemeId)) {
      this.activeThemeId = initialThemeId;
    }
  }

  /**
   * Register a new theme or update an existing one.
   */
  public registerTheme(theme: IconThemeDefinition): void {
    if (!theme || !theme.id) {
      throw new Error('IconThemeDefinition must possess a valid id');
    }
    this.themes.set(theme.id, theme);
  }

  /**
   * Unregister an existing theme.
   * If the active theme is removed, falls back to 'seti' or 'minimal'.
   */
  public unregisterTheme(id: string): boolean {
    if (!this.themes.has(id)) {
      return false;
    }

    this.themes.delete(id);

    if (this.activeThemeId === id) {
      const fallbackId = this.themes.has('seti')
        ? 'seti'
        : (this.themes.keys().next().value || 'minimal');
      this.setActiveTheme(fallbackId);
    }

    return true;
  }

  /**
   * Retrieve a theme definition by id.
   */
  public getTheme(id: string): IconThemeDefinition | undefined {
    return this.themes.get(id);
  }

  /**
   * Return all currently registered themes.
   */
  public getThemes(): IconThemeDefinition[] {
    return Array.from(this.themes.values());
  }

  /**
   * Check if a theme id exists.
   */
  public hasTheme(id: string): boolean {
    return this.themes.has(id);
  }

  /**
   * Return the currently active theme definition.
   */
  public getActiveTheme(): IconThemeDefinition {
    const active = this.themes.get(this.activeThemeId);
    if (!active) {
      // Fallback to SETI_ICON_THEME if map is corrupted
      return SETI_ICON_THEME;
    }
    return active;
  }

  /**
   * Return the ID of the currently active theme.
   */
  public getActiveThemeId(): string {
    return this.activeThemeId;
  }

  /**
   * Switch the active icon theme.
   * Returns true on successful switch, false if theme ID does not exist.
   */
  public setActiveTheme(id: string): boolean {
    if (!this.themes.has(id)) {
      return false;
    }

    if (this.activeThemeId === id) {
      return true; // Already active, no change
    }

    const previousThemeId = this.activeThemeId;
    this.activeThemeId = id;
    const currentTheme = this.getActiveTheme();

    const event: IconThemeChangeEvent = { previousThemeId, currentTheme };
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        // Suppress listener exceptions to guarantee registry stability
      }
    });

    return true;
  }

  /**
   * Subscribe to active theme changes.
   * Returns an unsubscribe callback.
   */
  public onDidChangeActiveTheme(listener: IconThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Resolve the icon CSS class string for a file by its name or path.
   * Format example: 'codicon codicon-file-code file-icon-ts'
   */
  public resolveFileIcon(filename: string): string {
    return this.resolveFileIconInfo(filename).icon;
  }

  /**
   * Resolve the folder icon CSS class string for collapsed or expanded state.
   * Optionally matches folder name specific icons (e.g. 'src', 'node_modules').
   */
  public resolveFolderIcon(isExpanded: boolean, folderName?: string): string {
    const info = this.resolveFolderIconInfo(isExpanded, folderName);
    return isExpanded ? info.folderExpanded : info.folder;
  }

  /**
   * Resolve detailed icon mapping (including colors, classes) for a file.
   */
  public resolveFileIconInfo(filename: string): IconMapping {
    const theme = this.getActiveTheme();
    if (!filename || typeof filename !== 'string') {
      return this.normalizeIconMapping(theme.defaultFile);
    }

    const cleanPath = filename.trim();
    const basename = cleanPath.split(/[/\\]/).filter(Boolean).pop() || cleanPath;
    if (!basename) {
      return this.normalizeIconMapping(theme.defaultFile);
    }

    const lower = basename.toLowerCase();

    // 1. Exact filename match (case-insensitive)
    if (theme.fileNames) {
      if (theme.fileNames[lower]) {
        return this.normalizeIconMapping(theme.fileNames[lower]);
      }
      if (theme.fileNames[basename]) {
        return this.normalizeIconMapping(theme.fileNames[basename]);
      }

      // Special prefix match for environment files (e.g. .env.development.local -> .env)
      if (lower.startsWith('.env.') && theme.fileNames['.env']) {
        return this.normalizeIconMapping(theme.fileNames['.env']);
      }
    }

    // 2. Extension match
    if (theme.fileExtensions) {
      const parts = lower.split('.');
      if (parts.length > 2) {
        // Multi-part extension check (e.g., 'test.ts', 'tar.gz', 'd.ts')
        const doubleExt = parts.slice(-2).join('.');
        if (theme.fileExtensions[doubleExt]) {
          return this.normalizeIconMapping(theme.fileExtensions[doubleExt]);
        }
      }

      if (parts.length > 1) {
        const ext = parts.pop()!;
        if (theme.fileExtensions[ext]) {
          return this.normalizeIconMapping(theme.fileExtensions[ext]);
        }
      }
    }

    // 3. Fallback to default file icon
    return this.normalizeIconMapping(theme.defaultFile);
  }

  /**
   * Resolve detailed folder mapping for collapsed or expanded state.
   */
  public resolveFolderIconInfo(isExpanded: boolean, folderName?: string): FolderIconMapping {
    const theme = this.getActiveTheme();

    if (folderName && typeof folderName === 'string') {
      const clean = folderName.trim().split(/[/\\]/).filter(Boolean).pop() || folderName.trim();
      const lower = clean.toLowerCase();

      if (theme.folderNames) {
        if (theme.folderNames[lower]) {
          return theme.folderNames[lower];
        }
        if (theme.folderNames[clean]) {
          return theme.folderNames[clean];
        }
      }
    }

    return theme.defaultFolder;
  }

  /**
   * Helper to normalize string or IconMapping into a unified IconMapping object.
   */
  private normalizeIconMapping(mapping: IconMapping | string): IconMapping {
    if (typeof mapping === 'string') {
      return { icon: mapping };
    }
    return mapping;
  }
}

// ============================================================================
// Singleton Default Export & Convenience API
// ============================================================================

export const defaultIconThemeRegistry = new IconThemeRegistry();

export function resolveFileIcon(filename: string): string {
  return defaultIconThemeRegistry.resolveFileIcon(filename);
}

export function resolveFolderIcon(isExpanded: boolean, folderName?: string): string {
  return defaultIconThemeRegistry.resolveFolderIcon(isExpanded, folderName);
}
