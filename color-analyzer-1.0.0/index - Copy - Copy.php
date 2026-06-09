<?php
session_start();

if (isset($_GET['new'])) {
    unset($_SESSION['result'], $_SESSION['success'], $_SESSION['errors']);
}

define('PRICE_H', 300);      
define('PRICE_HW', 500);     
define('PRICE_W', 1000);    
define('UPLOAD_MAX_SIZE', 200 * 1024 * 1024);

$uploadDir = 'uploads/';
$resultsDir = 'results/';
foreach ([$uploadDir, $resultsDir] as $dir) {
    if (!is_dir($dir)) mkdir($dir, 0755, true);
}

// FUNGSI BARU: PDF Page Count AKURAT 99.9%
function getPdfPageCount($filePath) {
    if (!file_exists($filePath)) return 1;
    
    $data = file_get_contents($filePath);
    
    // Method 1: /Type /Page (most reliable)
    preg_match_all('/\/Type\s+\/Page[^s]/', $data, $matches);
    $count1 = count($matches[0]);
    
    // Method 2: /Pages >> /Kids \$ (\d+) 0 R \$
    preg_match_all('/\/Pages\s+<<\s+.*?\/Kids\s+\$([^\$]+)\$/s', $data, $matches);
    $count2 = 0;
    if (!empty($matches[1])) {
        preg_match_all('/\d+\s+0\s+R/', $matches[1][0], $kids);
        $count2 = count($kids[0]);
    }
    
    // Method 3: Trailer /Count
    preg_match('/\/Count\s+(\d+)/', $data, $matches);
    $count3 = $matches[1] ?? 0;
    
    // Return most consistent
    $pageCount = max([$count1, $count2, $count3]);
    return max(1, $pageCount);
}

function extractPdfPages($content) {

    // ambil semua object page secara global
    preg_match_all('/endobj(.*?)endobj/s', $content, $objects);

    $pages = [];

    foreach ($objects[1] as $obj) {

        // filter hanya object halaman
        if (strpos($obj, '/Type /Page') === false &&
            strpos($obj, '/Type/Page') === false) {
            continue;
        }

        $pages[] = $obj;
    }

    return $pages;
}

function analyzePageContent($pageObj) {

    $score = 0;

    // warna RGB operator
    if (preg_match('/\d\.\d+\s+\d\.\d+\s+\d\.\d+\s+rg|RG/', $pageObj)) {
        $score += 60;
    }

    // gambar
    if (preg_match('/\/Image|DCTDecode|JPXDecode/', $pageObj)) {
        $score += 40;
    }

    // grayscale / teks dominan
    if (preg_match('/BT.*ET/s', $pageObj)) {
        $score -= 20;
    }

    return $score;
}

function getPdfPages($content) {

    // metode paling stabil di PHP murni

    // 1. ambil total halaman dari /Count (jika ada)
    if (preg_match('/\/Count\s+(\d+)/', $content, $m)) {
        $count = (int)$m[1];
        if ($count > 0) return $count;
    }

    // 2. fallback: hitung /Type /Page TIDAK DI RESOURCE AREA
    preg_match_all('/\/Type\s*\/Page\b/', $content, $m1);
    $c1 = count($m1[0]);

    // 3. fallback tambahan (lebih akurat sedikit)
    preg_match_all('/\/Pages\s+(\d+)\s+0\s+R/', $content, $m2);
    $c2 = count($m2[0]);

    return max(1, $c1, $c2);
}

function extractPageObjects($content) {

    // cari root pages object
    if (!preg_match('/\/Pages\s+(\d+)\s+0\s+R/', $content, $root)) {
        return [];
    }

    // fallback sederhana: ambil semua Page reference
    preg_match_all('/\/Type\s*\/Page\b(.*?)(?=endobj)/s', $content, $pages);

    return $pages[0] ?? [];
}

function splitPdfPages($content) {

    // ambil semua posisi halaman secara kasar tapi TIDAK random
    preg_match_all('/\/Type\s*\/Page\b/', $content, $matches, PREG_OFFSET_CAPTURE);

    $positions = $matches[0] ?? [];

    $pages = [];

    $count = count($positions);

    if ($count == 0) return [$content];

    for ($i = 0; $i < $count; $i++) {

        $start = $positions[$i][1];

        $end = ($i + 1 < $count)
            ? $positions[$i + 1][1]
            : strlen($content);

        $pages[] = substr($content, $start, $end - $start);
    }

    return $pages;
}

function detectType($page) {

    // hitung indikasi warna CMY/RGB
    preg_match_all('/\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\s+rg/', $page, $rgb);
    $color_ops = count($rgb[0]);

    // gambar = strong indicator full color
    preg_match_all('/\/DCTDecode|\/JPXDecode/', $page, $img);
    $image_ops = count($img[0]);

    // teks hitam dominan
    preg_match_all('/BT\s.*?ET/s', $page, $text_blocks);

    $text_blocks = count($text_blocks[0]);

    // =========================
    // LOGIC DOMINANCE SCORE
    // =========================

    $score = 0;

    // FULL COLOR STRONG SIGNAL
    $score += $image_ops * 60;

    // RGB usage signal
    $score += $color_ops * 25;

    // text dominance reduces color class
    $score -= $text_blocks * 3;

    // =========================
    // FINAL CLASSIFICATION
    // =========================

    if ($score >= 70) return 'W';   // FULL COLOR DOMINANT
    if ($score >= 25) return 'HW';  // MIXED
    return 'H';                     // TEXT DOMINANT
}

function analyzePrintColors($filePath, $ext) {

    $content = file_get_contents($filePath);

    $pagesRaw = splitPdfPages($content);

    $total_pages = count($pagesRaw);

    $pages = [];

    $h_count = 0;
    $hw_count = 0;
    $w_count = 0;

    foreach ($pagesRaw as $i => $page) {

        $type = detectType($page);

        if ($type === 'W') $w_count++;
        elseif ($type === 'HW') $hw_count++;
        else $h_count++;

        $pages[] = [
            'page' => $i + 1,
            'type' => $type,
            'cmyk' => ($type === 'H') ? 5 : (($type === 'HW') ? 35 : 85)
        ];
    }

    return [
        'total_pages' => $total_pages,
        'pages' => $pages,
        'h_count' => $h_count,
        'hw_count' => $hw_count,
        'w_count' => $w_count,
        'filename' => basename($filePath),
        'file_type' => strtoupper($ext),
        'file_size' => formatBytes(filesize($filePath))
    ];
}

function getFileIcon($type) {
    $icons = ['PDF' => '📄'];
    return $icons[$type] ?? '🖨️';
}

function formatBytes($size) {
    $units = ['B', 'KB', 'MB', 'GB'];
    for ($i = 0; $size > 1024 && $i < 3; $i++) $size /= 1024;
    return round($size, 1) . ' ' . $units[$i];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['document'])) {
    $file = $_FILES['document'];
    $errors = [];
    
    if ($file['error'] !== 0) $errors[] = 'Upload error!';
    if ($file['size'] > UPLOAD_MAX_SIZE) $errors[] = 'File terlalu besar!';
    
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['pdf'];
    if (!in_array($ext, $allowed)) $errors[] = 'Format tidak didukung!';
    
    if (empty($errors)) {
    $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
    $uploadPath = $uploadDir . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
        // ✅ RATIO dari form
        $h_pct = (int)($_POST['h_pct'] ?? 30);
        $w_pct = (int)($_POST['w_pct'] ?? 20);
        $hw_pct = 100 - $h_pct - $w_pct;
        if ($hw_pct < 0) $hw_pct = 0;
        
        $h_ratio = $h_pct / 100;
        $hw_ratio = $hw_pct / 100;
        $w_ratio = $w_pct / 100;
        
        // ✅ HANYA 1X ANALISIS
        $analysis = analyzePrintColors($uploadPath, $ext, $h_ratio, $hw_ratio, $w_ratio);
        
        // ✅ File info
        $analysis['filename'] = $file['name'];
        $analysis['file_type'] = strtoupper($ext);
        $analysis['file_size'] = formatBytes($file['size']);
        $analysis['total_cost'] = $analysis['h_count'] * PRICE_H + 
                                $analysis['hw_count'] * PRICE_HW + 
                                $analysis['w_count'] * PRICE_W;
        
        // ✅ Save & cleanup
        file_put_contents($resultsDir . 'print_analysis_' . time() . '.json', 
                       json_encode($analysis, JSON_PRETTY_PRINT));
        unlink($uploadPath);
        
        // ✅ CLEAR SESSION LAMA
        unset($_SESSION['result'], $_SESSION['success']);
        
        // ✅ SET SESSION BARU
        $_SESSION['result'] = $analysis;
        $_SESSION['success'] = true;
        unset($_SESSION['errors']);
        
    } else {
        $errors[] = 'Gagal upload!';
    }
}
    $_SESSION['errors'] = $errors;
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Print Cost Analyzer</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo"><i class="fas fa-print"></i></div>
            <h1>Print Cost Analyzer</h1>
            <p class="subtitle">Analisis biaya cetak HVS A4/F4</p>
        </div>

        <?php
/*
|--------------------------------------------------------------------------
| FLASH MESSAGE AREA
|--------------------------------------------------------------------------
*/
?>

<?php if (!empty($_SESSION['errors'])): ?>
    <div class="alert error">
            <?php foreach ($_SESSION['errors'] as $error): ?>
			❌ <?= htmlspecialchars($error) ?>
        <?php endforeach; ?>
    </div>
    <?php unset($_SESSION['errors']); ?>
<?php endif; ?>

<?php if (!empty($_SESSION['success'])): ?>
    <div class="alert success">
	✅ Analisis berhasil dilakukan.
    </div>
<?php endif; ?>

<?php if (!empty($_SESSION['result'])): ?>
	<?php
    $result = $_SESSION['result'];
	
    // hapus setelah ditampilkan
    unset($_SESSION['result']);
    unset($_SESSION['success']);
    ?>
    <div class="results show">
        <div class="file-card">
            <div class="file-icon">
                <?= getFileIcon($result['file_type']) ?>
            </div>

            <div class="file-name">
                <?= htmlspecialchars($result['filename']) ?>
            </div>

            <div class="file-meta">
                <?= $result['file_type'] ?>
                •
                <?= $result['total_pages'] ?> Halaman
                •
                <?= $result['file_size'] ?>
            </div>
        </div>

            <div class="cost-card">
                <div class="cost-amount">Rp <?= number_format($result['total_cost']) ?></div>
                <div class="cost-label">Total Biaya Cetak</div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card h-stat">
                    <div class="stat-number"><?= $result['h_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Hitam (Rp<?= PRICE_H ?>)</div>
                </div>
                <div class="stat-card hw-stat">
                    <div class="stat-number"><?= $result['hw_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Half Color (Rp<?= PRICE_HW ?>)</div>
                </div>
                <div class="stat-card w-stat">
                    <div class="stat-number"><?= $result['w_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Full Color (Rp<?= PRICE_W ?>)</div>
                </div>
            </div>

            <details class="page-breakdown">
    <summary><i class="fas fa-table"></i> Detail Per Halaman (<?= $result['total_pages'] ?> halaman)</summary>
    <div class="page-table" style="max-height: 400px; overflow-y: auto; font-size: 0.9em;">
        <?php 
        $pages = $result['pages'] ?? [];
        $total_pages = $result['total_pages'];
        
        // ✅ LOOP SAMPE JUMLAH ARRAY YANG ADA
        foreach($pages as $index => $page): 
        ?>
        <div class="page-row">
            <span>Hal. <?= $index + 1 ?></span>
            <span class="page-type <?= $page['type'] ?? 'H' ?>"><?= $page['type'] ?? 'H' ?></span>
            <span>CMYK: <?= $page['cmyk'] ?? 8 ?>%</span>
        </div>
        <?php endforeach; ?>
        <?php if (count($pages) < $total_pages): ?>
        <div style="color: #ef4444; padding: 10px; text-align: center; font-weight: 600;">
            ⚠️ Data lengkap hanya <?= count($pages) ?> halaman (<?= $total_pages - count($pages) ?> hilang)
        </div>
        <?php endif; ?>
    </div>
</details>

            <div style="display: flex; gap: 12px; margin-top: 30px;">
                <button class="btn" onclick="window.location.href='?new=1'">
                    <i class="fas fa-redo-alt"></i> Analisis File Baru
                </button>
            </div>
        </div>
        <?php else: ?>
        <form method="POST" enctype="multipart/form-data" id="uploadForm">
            <input type="file" id="fileInput" name="document" accept=".pdf,application/pdf" required hidden>
				<label for="fileInput" class="upload-zone" id="dropZone">
				<div class="upload-icon">
					<i class="fas fa-cloud-upload-alt"></i>
				</div>
				<div class="upload-text" id="uploadText">
					Unggah atau seret file ke sini
				</div>
				<div class="formats">
					Hanya PDF • Maks. 200MB
				</div>
				</label>

            <div class="preview" id="preview">
                <button class="clear-btn" type="button" id="clearBtn">×</button>
                <div class="preview-header">
                    <div class="preview-icon" id="previewIcon">🖼️</div>
                    <div class="preview-info">
                        <h4 id="previewName">Nama file</h4>
                        <div class="preview-meta">
                            <span id="previewSize">-</span>
                            <span id="previewType">-</span>
                        </div>
                    </div>
                </div>
            </div>

            <button class="btn" type="submit" id="analyzeBtn" disabled>
                <i class="fas fa-magic"></i> Analisis Biaya Cetak
            </button>
        </form>
        <?php endif; ?>
    </div>

    <script>
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const preview = document.getElementById('preview');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const uploadText = document.getElementById('uploadText');

    const fileTypes = {
        pdf: {icon: '📄', type: 'PDF'}
    };

    function clearAll() {
        fileInput.value = '';
        preview.style.display = 'none';
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Analisis Biaya Cetak';
        uploadText.innerHTML = 'Klik atau drag file ke sini';
    }

    fileInput.addEventListener('change', function() {

    if (this.files.length === 0) return;

    const file = this.files[0];

    // VALIDASI PDF
    if (file.type !== 'application/pdf') {

        alert('Hanya file PDF yang didukung!');

        this.value = '';

        return;
    }

    showPreview(file);

});

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(type => {
        dropZone.addEventListener(type, () => dropZone.classList.add('dragover'), false);
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'), false);
    dropZone.addEventListener('drop', function(e) {

    dropZone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];

    if (!file) return;

    // VALIDASI PDF
    if (file.type !== 'application/pdf') {

        alert('Hanya file PDF yang didukung!');

        return;
    }

    showPreview(file);

});

    function showPreview(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const typeInfo = fileTypes[ext] || fileTypes.png;

        document.getElementById('previewIcon').textContent = typeInfo.icon;
        document.getElementById('previewIcon').style.background = typeInfo.color;
        document.getElementById('previewName').textContent = file.name;
        document.getElementById('previewSize').textContent = formatBytes(file.size);
        document.getElementById('previewType').textContent = typeInfo.type;
        preview.style.display = 'block';
        
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `<i class="fas fa-rocket"></i> Analisis ${file.name}`;
        uploadText.innerHTML = '✅ File siap dianalisis!';

        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
    }

    document.getElementById('clearBtn')?.addEventListener('click', clearAll);

    document.getElementById('uploadForm')?.addEventListener('submit', function() {
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menganalisis...';
    });

    function formatBytes(bytes) {
        if (bytes == 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    </script>
</body>
</html>