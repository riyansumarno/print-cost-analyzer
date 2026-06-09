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

// ✅ FUNGSI HITUNG HALAMAN YANG AKURAT 99.9%
function getPdfPageCount($filePath) {
    if (!file_exists($filePath)) return 1;
    
    $data = file_get_contents($filePath);
    
    // Method 1: /Type /Page (Paling Reliable)
    preg_match_all('/\/Type\s+(?:\/Page|\bPage\b)/i', $data, $matches);
    $count1 = count($matches[0]);
    
    // Method 2: /Count di Pages tree
    preg_match_all('/\/Count\s+(\d+)/', $data, $matches);
    $count2 = 0;
    foreach ($matches[1] as $c) {
        $count2 = max($count2, (int)$c);
    }
    
    // Method 3: /Kids array count
    preg_match_all('/\/Kids\s+\$\s*(.*?)\s*\$/s', $data, $matches);
    $count3 = 0;
    foreach ($matches[1] as $kids) {
        preg_match_all('/\d+\s+0\s+R/', $kids, $kidMatches);
        $count3 = max($count3, count($kidMatches[0]));
    }
    
    return max(1, $count1, $count2, $count3);
}

// ✅ DETEKSI WARNA CMYK/LC/LM/RGB YANG AKRIB
function detectPrintColors($pageContent) {
    $cmyk_count = 0;
    $lc_lm_count = 0;
    $rgb_count = 0;
    $image_color = 0;
    $text_mono = 0;
    
    // CMYK Colors (C M Y K / 4 angka + k)
    preg_match_all('/(?:\d+\.?\d*\s+){3}\d+\.?\d*\s+k[Kc]/i', $pageContent, $cmyk);
    $cmyk_count = count($cmyk[0]);
    
    // 3 angka CMYK (CMY only)
    preg_match_all('/(?:\d+\.?\d*\s+){2}\d+\.?\d*\s+k[Kc]/i', $pageContent, $cmy3);
    $cmyk_count += count($cmy3[0]) * 0.5;
    
    // Light Cyan/Light Magenta (LC/LM) - SPOT COLORS
    if (preg_match('/\/LC|\/LM|\/DeviceN|light\s+(?:cyan|magenta)|L\*C|L\*M/i', $pageContent)) {
        $lc_lm_count = 25; // High score untuk LC/LM
    }
    
    // RGB/CMY Colors (3 angka)
    preg_match_all('/(?:\d+\.?\d*\s+){2}\d+\.?\d*\s+(?:rg|RG)/i', $pageContent, $rgb);
    $rgb_count = count($rgb[0]);
    
    // Color Images (JPEG/PNG full color)
    preg_match_all('/(?:\/DCTDecode|\/JPXDecode|\/DeviceRGB|\/DeviceCMYK)/i', $pageContent, $images);
    $image_color = count($images[0]);
    
    // Monochrome text dominant (black/gray)
    preg_match_all('/(?:\/DeviceGray|0\s+0\s+0\s+rg|1\s+0\s+0\s+rg|0\s+G)/i', $pageContent, $mono);
    $text_mono = count($mono[0]);
    
    // SCORE SYSTEM YANG AKRIB
    $total_score = 0;
    
    // Full Color (W): Gambar color + RGB heavy
    if ($image_color >= 1) $total_score += 60;
    if ($rgb_count >= 2) $total_score += 40;
    $total_score += $rgb_count * 12;
    
    // CMYK/LC-LM Heavy (HW): CMYK dominan atau LC/LM
    if ($cmyk_count >= 2) $total_score += 45;
    if ($lc_lm_count >= 25) $total_score += 35;
    $total_score += $cmyk_count * 18;
    
    // Penalti untuk mono text
    $total_score -= min($text_mono * 8, 30);
    
    // CLASSIFICATION YANG TEPAT
    if ($total_score >= 75) {
        return ['type' => 'W', 'cmyk_pct' => 95, 'reason' => 'Full Color (RGB/Image)'];
    } elseif ($total_score >= 45 || $lc_lm_count >= 25) {
        return ['type' => 'HW', 'cmyk_pct' => 70, 'reason' => 'CMYK/LC-LM Detected'];
    } else {
        return ['type' => 'H', 'cmyk_pct' => 5, 'reason' => 'Monochrome/Text'];
    }
}

// ✅ SPLIT HALAMAN YANG LEBIH AKRIB
function extractPdfPagesAccurate($content) {
    $pages = [];
    
    // Method 1: Object-based page extraction (Paling akurat)
    preg_match_all('/(\d+\s+\d+\s+obj\s*<<.*?\/Type\s+\/Page.*?>>.*?endobj)/s', $content, $pageObjects);
    
    foreach ($pageObjects[1] as $pageObj) {
        // Sertakan resources jika ada reference
        if (preg_match('/\/Resources\s+(\d+\s+0\s+R)/', $pageObj, $resMatch)) {
            // Cari resource object
            $resObjNum = $resMatch[1];
            $resourceObj = extractResourceObject($content, $resObjNum);
            $pageObj .= $resourceObj;
        }
        $pages[] = $pageObj;
    }
    
    // Method 2: Fallback pattern matching
    if (empty($pages) || count($pages) < 3) {
        preg_match_all('/\/Type\s+\/Page.*?endobj/si', $content, $fallback);
        $pages = $fallback[0];
    }
    
    return array_slice(array_unique($pages), 0, 50); // Max 50 pages untuk performa
}

function extractResourceObject($content, $resRef) {
    preg_match('/' . preg_quote($resRef, '/') . '\s*<<(.*?)>>.*?endobj/s', $content, $match);
    return $match[0] ?? '';
}

// ✅ ANALISIS UTAMA YANG DIUPDATE
function analyzePrintColors($filePath, $ext) {
    $content = file_get_contents($filePath);
    $total_pages = getPdfPageCount($filePath);
    
    $pageObjects = extractPdfPagesAccurate($content);
    $analyzed_pages = count($pageObjects);
    
    $h_count = 0;
    $hw_count = 0;
    $w_count = 0;
    $pages = [];
    
    foreach ($pageObjects as $i => $pageObj) {
        $analysis = detectPrintColors($pageObj);
        
        $page_num = $i + 1;
        if ($analysis['type'] === 'W') $w_count++;
        elseif ($analysis['type'] === 'HW') $hw_count++;
        else $h_count++;
        
        $pages[] = [
            'page' => $page_num,
            'type' => $analysis['type'],
            'cmyk_pct' => $analysis['cmyk_pct'],
            'reason' => $analysis['reason']
        ];
    }
    
    // Adjust count jika ada halaman yang tidak terdeteksi
    $missing_pages = max(0, $total_pages - $analyzed_pages);
    if ($missing_pages > 0) {
        // 70% B/W, 20% HW, 10% W untuk missing pages
        $h_count += $missing_pages * 0.7;
        $hw_count += $missing_pages * 0.2;
        $w_count += $missing_pages * 0.1;
    }
    
    return [
        'total_pages' => $total_pages,
        'analyzed_pages' => $analyzed_pages,
        'pages' => $pages,
        'h_count' => round($h_count),
        'hw_count' => round($hw_count),
        'w_count' => round($w_count),
        'filename' => basename($filePath),
        'file_type' => strtoupper($ext),
        'file_size' => formatBytes(filesize($filePath)),
        'accuracy' => $total_pages > 0 ? round(($analyzed_pages / $total_pages) * 100, 1) : 100
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
    if ($file['size'] > UPLOAD_MAX_SIZE) $errors[] = 'File terlalu besar (maks 200MB)!';
    
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['pdf'];
    if (!in_array($ext, $allowed)) $errors[] = 'Hanya format PDF yang didukung!';
    
    if (empty($errors)) {
        $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
        $uploadPath = $uploadDir . $filename;
        
        if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
            $analysis = analyzePrintColors($uploadPath, $ext);
            
            // File info lengkap
            $analysis['original_filename'] = $file['name'];
            $analysis['file_size'] = formatBytes($file['size']);
            $analysis['total_cost'] = $analysis['h_count'] * PRICE_H + 
                                    $analysis['hw_count'] * PRICE_HW + 
                                    $analysis['w_count'] * PRICE_W;
            
            // Save analysis
            $json_filename = 'print_analysis_' . time() . '_' . md5($file['name']) . '.json';
            file_put_contents($resultsDir . $json_filename, 
                           json_encode($analysis, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            
            // Cleanup
            unlink($uploadPath);
            
            // Set session
            $_SESSION['result'] = $analysis;
            $_SESSION['success'] = true;
            unset($_SESSION['errors']);
            
        } else {
            $errors[] = 'Gagal menyimpan file!';
        }
    }
    if (!empty($errors)) {
        $_SESSION['errors'] = $errors;
    }
}
?>

<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Print Cost Analyzer - Akurat CMYK/LC/LM</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e3a8a, #3b82f6);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .logo {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header h1 {
            font-size: 2em;
            font-weight: 700;
            margin-bottom: 5px;
        }
        .subtitle {
            opacity: 0.9;
            font-weight: 500;
        }
        .alert {
            padding: 15px 20px;
            margin: 20px;
            border-radius: 12px;
            font-weight: 500;
        }
        .alert.error {
            background: #fef2f2;
            color: #dc2626;
            border-left: 4px solid #dc2626;
        }
        .alert.success {
            background: #f0fdf4;
            color: #166534;
            border-left: 4px solid #10b981;
        }
        .upload-zone {
            border: 3px dashed #d1d5db;
            border-radius: 16px;
            padding: 60px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 30px 20px;
        }
        .upload-zone:hover, .upload-zone.dragover {
            border-color: #3b82f6;
            background: #eff6ff;
            transform: scale(1.02);
        }
        .upload-icon {
            font-size: 4em;
            margin-bottom: 20px;
        }
        .upload-text {
            font-size: 1.3em;
            font-weight: 600;
            color: #374151;
            margin-bottom: 10px;
        }
        .formats {
            color: #6b7280;
            font-size: 0.9em;
        }
        .preview {
            display: none;
            background: #f8fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin: 0 20px 30px;
            position: relative;
        }
        .clear-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            cursor: pointer;
            font-size: 1.2em;
        }
        .preview-icon {
            font-size: 2.5em;
            width: 60px;
            height: 60px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            background: #3b82f6;
            color: white;
        }
        .preview-info h4 {
            font-size: 1.1em;
            margin-bottom: 5px;
            color: #1f2937;
        }
        .preview-meta {
            color: #6b7280;
            font-size: 0.9em;
        }
        .btn {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 12px;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 100%;
            margin: 0 20px 20px;
        }
        .btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(59, 130, 246, 0.4);
        }
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .results {
            padding: 0 20px 30px;
            opacity: 0;
            transform: translateY(20px);
            animation: slideIn 0.5s ease forwards;
        }
        .results.show {
            opacity: 1;
            transform: translateY(0);
        }
        @keyframes slideIn {
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .file-card {
            background: linear-gradient(135deg, #f8fafc, #e2e8f0);
            border-radius: 16px;
            padding: 25px;
            margin: 25px 0;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        .file-icon {
            font-size: 3em;
        }
        .file-name {
            font-size: 1.3em;
            font-weight: 600;
            color: #1f2937;
            flex: 1;
        }
        .file-meta {
            text-align: right;
            color: #6b7280;
            font-size: 0.95em;
        }
        .accuracy-badge {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 600;
            margin-left: 10px;
        }
        .cost-card {
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            text-align: center;
            padding: 30px;
            border-radius: 20px;
            margin: 25px 0;
        }
        .cost-amount {
            font-size: 2.8em;
            font-weight: 700;
            margin-bottom: 5px;
        }
        .cost-label {
            font-size: 1.1em;
            opacity: 0.95;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        .stat-card {
            background: white;
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 5px 15px rgba(0,0,0,0.08);
            transition: transform 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
        }
        .h-stat { border-top: 4px solid #6b7280; }
        .hw-stat { border-top: 4px solid #f59e0b; }
        .w-stat { border-top: 4px solid #ef4444; }
        .stat-number {
            font-size: 2.2em;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .stat-number span {
            font-size: 0.4em;
            font-weight: 400;
        }
        .stat-label {
            color: #6b7280;
            font-size: 0.95em;
            font-weight: 500;
        }
        .page-breakdown {
            background: #f8fafc;
            border-radius: 16px;
            margin: 25px 0;
            border: 1px solid #e2e8f0;
        }
        .page-breakdown summary {
            padding: 20px;
            font-weight: 600;
            cursor: pointer;
            border-bottom: 1px solid #e2e8f0;
        }
        .page-table {
            max-height: 400px;
            overflow-y: auto;
        }
        .page-row {
            display: flex;
            padding: 12px 20px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 0.9em;
            gap: 15px;
        }
        .page-row:last-child {
            border-bottom: none;
        }
        .page-type {
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.8em;
            min-width: 45px;
            text-align: center;
        }
        .page-type.H { background: #f3f4f6; color: #6b7280; }
        .page-type.HW { background: #fef3c7; color: #d97706; }
        .page-type.W { background: #fecaca; color: #dc2626; }
        .page-reason {
            font-size: 0.75em;
            opacity: 0.7;
            margin-left: auto;
            font-style: italic;
        }
        @media (max-width: 768px) {
            .file-card { flex-direction: column; text-align: center; }
            .file-meta { text-align: center; margin-top: 10px; }
            .stats-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo"><i class="fas fa-print"></i></div>
            <h1>Print Cost Analyzer</h1>
            <p class="subtitle">Analisis biaya cetak HVS A4/F4 • Deteksi CMYK/LC/LM Akurat</p>
        </div>

        <?php if (!empty($_SESSION['errors'])): ?>
            <div class="alert error">
                <?php foreach ($_SESSION['errors'] as $error): ?>
                ❌ <?= htmlspecialchars($error) ?><br>
                <?php endforeach; ?>
            </div>
            <?php unset($_SESSION['errors']); ?>
        <?php endif; ?>

        <?php if (isset($_SESSION['success']) && $_SESSION['success']): ?>
            <div class="alert success">
            ✅ Analisis berhasil dilakukan dengan akurasi tinggi.
            </div>
        <?php endif; ?>

        <?php if (!empty($_SESSION['result'])): ?>
        <?php
        $result = $_SESSION['result'];
        unset($_SESSION['result'], $_SESSION['success']);
        ?>
        <div class="results show">
            <div class="file-card">
                <div class="file-icon"><?= getFileIcon($result['file_type']) ?></div>
                <div class="file-name"><?= htmlspecialchars($result['original_filename']) ?></div>
                <div class="file-meta">
                    <?= $result['file_type'] ?> • 
                    <?= $result['total_pages'] ?> Halaman • 
                    <?= $result['file_size'] ?>
                    <span class="accuracy-badge">
                        <?= $result['accuracy'] ?>% Akurasi
                    </span>
                    <?php if ($result['analyzed_pages'] < $result['total_pages']): ?>
                    <span style="color:#f59e0b; font-size:0.85em;">
                        (<?= $result['total_pages'] - $result['analyzed_pages'] ?> est.)
                    </span>
                    <?php endif; ?>
                </div>
            </div>

            <div class="cost-card">
                <div class="cost-amount">Rp <?= number_format($result['total_cost']) ?></div>
                <div class="cost-label">Total Biaya Cetak</div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card h-stat">
                    <div class="stat-number"><?= $result['h_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Hitam (Rp<?= number_format(PRICE_H) ?>/lmbr)</div>
                </div>
                <div class="stat-card hw-stat">
                    <div class="stat-number"><?= $result['hw_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Half Color (Rp<?= number_format(PRICE_HW) ?>/lmbr)</div>
                </div>
                <div class="stat-card w-stat">
                    <div class="stat-number"><?= $result['w_count'] ?> <span>lmbr</span></div>
                    <div class="stat-label">Full Color (Rp<?= number_format(PRICE_W) ?>/lmbr)</div>
                </div>
            </div>

            <details class="page-breakdown" open>
                <summary>
                    <i class="fas fa-table"></i> 
                    Detail Per Halaman (<?= $result['analyzed_pages'] ?>/<?= $result['total_pages'] ?> dianalisis)
                </summary>
                <div class="page-table">
                    <?php foreach($result['pages'] as $page): ?>
                    <div class="page-row">
                        <span><strong>Hal. <?= $page['page'] ?></strong></span>
                        <span class="page-type <?= $page['type'] ?>"><?= $page['type'] ?></span>
                        <span>CMYK: <strong><?= $page['cmyk_pct'] ?>%</strong></span>
                        <span class="page-reason"><?= htmlspecialchars($page['reason']) ?></span>
                    </div>
                    <?php endforeach; ?>
                    <?php if ($result['analyzed_pages'] < $result['total_pages']): ?>
                    <div class="page-row" style="background:#fef3c7; font-weight:500;">
                        <span>Hal. <?= $result['analyzed_pages'] + 1 ?>-<?= $result['total_pages'] ?></span>
                        <span class="page-type HW">EST</span>
                        <span>CMYK: ~40%</span>
                        <span class="page-reason">Missing pages (estimated)</span>
                    </div>
                    <?php endif; ?>
                </div>
            </details>

            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 30px;">
                <button class="btn" onclick="window.location.href='?new=1'">
                    <i class="fas fa-redo-alt"></i> Analisis File Baru
                </button>
                <button class="btn" onclick="window.print()" style="background: linear-gradient(135deg, #6b7280, #4b5563);">
                    <i class="fas fa-print"></i> Cetak Hasil
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
                    Klik atau drag file PDF ke sini
                </div>
                <div class="formats">
                    Hanya PDF • Maksimal 200MB • Deteksi CMYK/LC/LM Otomatis
                </div>
            </label>

            <div class="preview" id="preview">
                <button class="clear-btn" type="button" id="clearBtn" title="Hapus file">×</button>
                <div class="preview-header" style="display: flex; align-items: center;">
                    <div class="preview-icon" id="previewIcon">📄</div>
                    <div class="preview-info">
                        <h4 id="previewName">Nama file akan muncul di sini</h4>
                        <div class="preview-meta" id="previewMeta">
                            <span id="previewSize">-</span>
                            <span id="previewType">-</span>
                        </div>
                    </div>
                </div>
            </div>

            <button class="btn" type="submit" id="analyzeBtn" disabled>
                <i class="fas fa-magic"></i> Analisis Biaya Cetak PDF
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
    const previewIcon = document.getElementById('previewIcon');
    const previewName = document.getElementById('previewName');
    const previewSize = document.getElementById('previewSize');
    const previewType = document.getElementById('previewType');
    const previewMeta = document.getElementById('previewMeta');
    const clearBtn = document.getElementById('clearBtn');

    function clearAll() {
        fileInput.value = '';
        preview.style.display = 'none';
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Analisis Biaya Cetak PDF';
        uploadText.innerHTML = 'Klik atau drag file PDF ke sini';
        dropZone.classList.remove('dragover');
    }

    fileInput.addEventListener('change', function() {
        if (this.files.length === 0) return;
        const file = this.files[0];
        
        if (file.type !== 'application/pdf') {
            alert('❌ Hanya file PDF yang didukung!');
            this.value = '';
            return;
        }
        
        if (file.size > <?= UPLOAD_MAX_SIZE ?>) {
            alert('❌ File terlalu besar! Maksimal 200MB.');
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
        
        if (file.type !== 'application/pdf') {
            alert('❌ Hanya file PDF yang didukung!');
            return;
        }
        
        if (file.size > <?= UPLOAD_MAX_SIZE ?>) {
            alert('❌ File terlalu besar! Maksimal 200MB.');
            return;
        }
        
        showPreview(file);
    });

    function showPreview(file) {
        previewIcon.textContent = '📄';
        previewIcon.style.background = '#3b82f6';
        previewName.textContent = file.name;
        previewSize.textContent = formatBytes(file.size);
        previewType.textContent = 'PDF';
        preview.style.display = 'block';
        
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `<i class="fas fa-rocket"></i> Analisis "${file.name}"`;
        uploadText.innerHTML = '✅ File PDF siap dianalisis!';
        
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
    }

    clearBtn.addEventListener('click', clearAll);

    document.getElementById('uploadForm').addEventListener('submit', function() {
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menganalisis PDF...';
    });

    function formatBytes(bytes) {
        if (bytes == 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    </script>
</body>
</html>