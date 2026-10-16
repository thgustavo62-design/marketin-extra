<#
.SYNOPSIS
  Baixa a foto de cada produto pelo codigo EAN (Google Imagens + bases de produto)
  e salva tudo numa pasta, com o nome EAN.jpg.

.DESCRIPTION
  Le uma planilha (.xlsx, .csv ou .txt) com os codigos EAN e, para cada um:
    1. Busca no Google Imagens pela API do Serper (chave gratis em serper.dev)
    2. Se nao achar uma boa, tenta Cosmos/Bluesoft (token gratis), Open Food Facts
       e Open Beauty Facts (sem cadastro)
    3. Valida a foto (tamanho, formato, site de origem, nome do produto no titulo)
    4. Padroniza: quadrada, fundo branco, 1000x1000, JPG
    5. Salva em banco\ (aprovada) ou revisar\ (pouca certeza)

  Sem chave nenhuma, use -Manual: o script abre o Google Imagens de cada EAN no
  navegador, voce salva a foto e ele renomeia e guarda sozinho.

  Pastas criadas dentro de -Saida:
    banco\      fotos aprovadas (EAN.jpg)
    revisar\    fotos encontradas com pouca certeza, confira antes de usar
    originais\  arquivo original baixado, sem tratamento
    relatorio_imagens.csv  status de cada EAN (abre no Excel)

.EXAMPLE
  .\Baixar-ImagensEAN.ps1 -Entrada .\produtos.xlsx -SerperKey "SUA_CHAVE"

.EXAMPLE
  .\Baixar-ImagensEAN.ps1 -Entrada .\produtos.xlsx -Manual

.EXAMPLE
  .\Baixar-ImagensEAN.ps1 -Entrada .\produtos.csv -Saida "C:\Imagens\Farmacia" -ColunaEan "Cod. Barras" -Limite 20
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Entrada,
    [string]$Saida = (Join-Path (Get-Location) 'banco_imagens'),
    [string]$ColunaEan,
    [string]$ColunaNome,
    [string]$SerperKey = $env:SERPER_API_KEY,
    [string]$CosmosToken = $env:COSMOS_TOKEN,
    [switch]$Manual,          # abre o Google Imagens para os EANs que faltarem
    [switch]$SoManual,        # pula a busca automatica e vai direto para o manual
    [string]$PastaDownloads,  # onde o navegador salva os arquivos (padrao: Downloads)
    [int]$EsperaManual = 180, # segundos esperando voce salvar cada foto
    [switch]$Refazer,         # baixa de novo mesmo o que ja existe
    [int]$Limite = 0,         # processa so os N primeiros (para testar)
    [int]$Tamanho = 1000      # lado do quadrado final, em pixels
)

# ============================================================== CONFIG
$NOTA_APROVAR   = 0.60   # nota >= isso vai para banco\, abaixo vai para revisar\
$LADO_MINIMO    = 300    # foto menor que isso e descartada
$MARGEM         = 0.06   # respiro em volta do produto
$PAUSA_MS       = 400    # pausa entre EANs, para nao estourar limite das APIs
$MAX_CANDIDATOS = 6      # quantas fotos do Google testar por EAN

$URL_SERPER = 'https://google.serper.dev/images'
$URL_COSMOS = 'https://api.cosmos.bluesoft.com.br/gtins/{0}.json'
$URL_OFF    = 'https://world.openfoodfacts.org/api/v2/product/{0}.json?fields=product_name,image_front_url,image_url'
$URL_OBF    = 'https://world.openbeautyfacts.org/api/v2/product/{0}.json?fields=product_name,image_front_url,image_url'
$URL_GOOGLE_MANUAL = 'https://www.google.com/search?tbm=isch&q={0}'

$DOMINIOS_BONS = @('drogaraia','drogasil','paguemenos','panvel','drogariasaopaulo','drogariaspacheco',
                   'ultrafarma','onofre','araujo','farmaciasapp','cosmos.bluesoft','carrefour',
                   'paodeacucar','nestle','jnj','amazon.com.br','magazineluiza','americanas')
$DOMINIOS_RUINS = @('pinterest','facebook','instagram','youtube','tiktok','shopee','aliexpress',
                    'olx','lookaside','fbsbx','gstatic','encrypted-tbn')
$STOPWORDS = @('com','sem','para','und','unid','unidade','cx','caixa','de','da','do','the','and')
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BancoImagensEAN/1.0'
# =====================================================================

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # deixa o download bem mais rapido no PowerShell 5
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

# System.Drawing faz a padronizacao (so existe no Windows)
$script:TemDrawing = $false
try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $teste = New-Object System.Drawing.Bitmap 1, 1
    $teste.Dispose()
    $script:TemDrawing = $true
} catch {}

# ---------------------------------------------------------------- texto
function Remove-Acentos([string]$s) {
    if (-not $s) { return '' }
    $n = $s.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object Text.StringBuilder
    foreach ($ch in $n.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    return $sb.ToString()
}

function Get-Tokens([string]$s) {
    $t = (Remove-Acentos $s).ToLower()
    $lista = @()
    foreach ($m in [regex]::Matches($t, '[a-z0-9]+')) {
        $v = $m.Value
        if ($v.Length -ge 2 -and $STOPWORDS -notcontains $v -and $lista -notcontains $v) { $lista += $v }
    }
    return , $lista
}

function Get-Semelhanca([string]$nome, [string]$titulo) {
    $a = Get-Tokens $nome
    if ($a.Count -eq 0) { return 0.5 }   # sem nome na planilha: neutro
    $b = Get-Tokens $titulo
    $comum = @($a | Where-Object { $b -contains $_ }).Count
    return $comum / $a.Count
}

function Get-Dominio([string]$url) {
    try { return ([uri]$url).Host.ToLower() } catch { return '' }
}

# ---------------------------------------------------------------- EAN
function Limpar-Ean($v) {
    if ($null -eq $v) { return '' }
    if ($v -is [double] -or $v -is [decimal] -or $v -is [int64] -or $v -is [int]) {
        return ([decimal]$v).ToString('0')
    }
    $s = "$v".Trim()
    if ($s -match '^\d+[.,]0+$') { $s = ($s -split '[.,]')[0] }
    return ($s -replace '\D', '')
}

function Test-Ean([string]$c) {
    if ($c -notmatch '^\d+$' -or @(8, 12, 13, 14) -notcontains $c.Length) { return $false }
    $corpo = $c.Substring(0, $c.Length - 1)
    $dv = [int]::Parse($c.Substring($c.Length - 1))
    $soma = 0; $i = 0
    for ($k = $corpo.Length - 1; $k -ge 0; $k--) {
        $d = [int]::Parse($corpo.Substring($k, 1))
        if ($i % 2 -eq 0) { $soma += 3 * $d } else { $soma += $d }
        $i++
    }
    return ((10 - ($soma % 10)) % 10) -eq $dv
}

# ---------------------------------------------------------------- leitura
function Ler-Csv([string]$caminho) {
    $bytes = [IO.File]::ReadAllBytes($caminho)
    try {
        $texto = (New-Object Text.UTF8Encoding($false, $true)).GetString($bytes)
    } catch {
        try { $enc = [Text.Encoding]::GetEncoding(1252) } catch { $enc = [Text.Encoding]::GetEncoding(28591) }
        $texto = $enc.GetString($bytes)
    }
    $texto = $texto.TrimStart([char]0xFEFF)
    $linhas = @($texto -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
    if ($linhas.Count -eq 0) { return @() }
    $cab = $linhas[0]
    $delim = ','
    $ptv = ($cab.ToCharArray() | Where-Object { $_ -eq ';' }).Count
    $vir = ($cab.ToCharArray() | Where-Object { $_ -eq ',' }).Count
    $tab = ($cab.ToCharArray() | Where-Object { $_ -eq "`t" }).Count
    if ($ptv -ge $vir -and $ptv -ge $tab -and $ptv -gt 0) { $delim = ';' }
    elseif ($tab -gt $vir) { $delim = "`t" }
    return @($linhas | ConvertFrom-Csv -Delimiter $delim)
}

function Ler-Excel([string]$caminho) {
    if (Get-Module -ListAvailable -Name ImportExcel) {
        Import-Module ImportExcel
        return @(Import-Excel -Path $caminho)
    }
    try { $xl = New-Object -ComObject Excel.Application }
    catch {
        throw "Para ler .xlsx preciso do Excel instalado ou do modulo ImportExcel (rode: Install-Module ImportExcel -Scope CurrentUser). Outra opcao: salve a planilha como CSV."
    }
    $wb = $null
    try {
        $xl.Visible = $false; $xl.DisplayAlerts = $false
        $wb = $xl.Workbooks.Open((Resolve-Path $caminho).Path, 0, $true)
        $dados = $wb.Worksheets.Item(1).UsedRange.Value2
        $nl = $dados.GetLength(0); $nc = $dados.GetLength(1)
        $cab = @()
        for ($c = 1; $c -le $nc; $c++) {
            $h = "$($dados[1, $c])".Trim()
            if (-not $h) { $h = "Coluna$c" }
            while ($cab -contains $h) { $h = "$h`_$c" }
            $cab += $h
        }
        $saida = New-Object Collections.Generic.List[object]
        for ($r = 2; $r -le $nl; $r++) {
            $o = [ordered]@{}
            for ($c = 1; $c -le $nc; $c++) { $o[$cab[$c - 1]] = $dados[$r, $c] }
            $saida.Add([pscustomobject]$o)
        }
        return $saida.ToArray()
    } finally {
        if ($wb) { $wb.Close($false) }
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}

function Achar-Coluna($linhas, [string]$pedida, [string[]]$pistas) {
    $nomes = @($linhas[0].PSObject.Properties.Name)
    if ($pedida) {
        if ($nomes -notcontains $pedida) { throw "Coluna '$pedida' nao existe. Colunas: $($nomes -join ' | ')" }
        return $pedida
    }
    foreach ($n in $nomes) {
        $x = (Remove-Acentos $n).ToLower()
        foreach ($p in $pistas) { if ($x.Contains($p)) { return $n } }
    }
    return $null
}

function Ler-Entrada {
    if (-not (Test-Path -LiteralPath $Entrada)) { throw "Arquivo nao encontrado: $Entrada" }
    $ext = [IO.Path]::GetExtension($Entrada).ToLower()
    $itens = New-Object Collections.Generic.List[object]
    $vistos = @{}

    if ($ext -eq '.txt') {
        foreach ($l in (Get-Content -LiteralPath $Entrada)) {
            $e = Limpar-Ean $l
            if ($e -and -not $vistos.ContainsKey($e)) { $vistos[$e] = 1; $itens.Add([pscustomobject]@{ ean = $e; nome = '' }) }
        }
        return $itens.ToArray()
    }

    if ($ext -eq '.csv') { $linhas = @(Ler-Csv $Entrada) }
    elseif ($ext -in '.xlsx', '.xlsm', '.xls') { $linhas = @(Ler-Excel $Entrada) }
    else { throw "Formato nao suportado: $ext (use .xlsx, .csv ou .txt)" }
    if ($linhas.Count -eq 0) { throw "A planilha esta vazia." }

    $ce = Achar-Coluna $linhas $ColunaEan @('ean', 'gtin', 'barra', 'codbar', 'cod_bar', 'cod bar')
    if (-not $ce) {
        # sem cabecalho conhecido: procura a coluna cujos valores parecem EAN
        foreach ($n in $linhas[0].PSObject.Properties.Name) {
            $amostra = @($linhas | Select-Object -First 30 | ForEach-Object { Limpar-Ean $_.$n })
            $ok = @($amostra | Where-Object { Test-Ean $_ }).Count
            if ($amostra.Count -gt 0 -and $ok / $amostra.Count -ge 0.5) { $ce = $n; break }
        }
    }
    if (-not $ce) {
        throw "Nao achei a coluna de EAN. Use -ColunaEan. Colunas: $($linhas[0].PSObject.Properties.Name -join ' | ')"
    }
    $cn = Achar-Coluna $linhas $ColunaNome @('descri', 'produto', 'nome')
    Write-Host "Coluna EAN: '$ce'   Coluna nome: '$(if ($cn) { $cn } else { '(nenhuma)' })'"

    $cientifico = $false
    foreach ($l in $linhas) {
        $bruto = $l.$ce
        if ("$bruto" -match '[eE]\+') { $cientifico = $true }
        $e = Limpar-Ean $bruto
        $nome = if ($cn) { "$($l.$cn)".Trim() } else { '' }
        if ($e -and -not $vistos.ContainsKey($e)) { $vistos[$e] = 1; $itens.Add([pscustomobject]@{ ean = $e; nome = $nome }) }
    }
    if ($cientifico) {
        Write-Warning "Ha EANs em notacao cientifica (ex: 7,89E+12). Eles vao sair como invalidos: formate a coluna como Texto no Excel e exporte de novo."
    }
    return $itens.ToArray()
}

# ---------------------------------------------------------------- download / imagem
function Get-TipoImagem([string]$arquivo) {
    $fs = [IO.File]::OpenRead($arquivo)
    try { $b = New-Object byte[] 16; $n = $fs.Read($b, 0, 16) } finally { $fs.Close() }
    if ($n -lt 12) { return $null }
    if ($b[0] -eq 0xFF -and $b[1] -eq 0xD8 -and $b[2] -eq 0xFF) { return 'jpg' }
    if ($b[0] -eq 0x89 -and $b[1] -eq 0x50 -and $b[2] -eq 0x4E -and $b[3] -eq 0x47) { return 'png' }
    if ($b[0] -eq 0x47 -and $b[1] -eq 0x49 -and $b[2] -eq 0x46) { return 'gif' }
    if ($b[0] -eq 0x42 -and $b[1] -eq 0x4D) { return 'bmp' }
    $a = [Text.Encoding]::ASCII.GetString($b)
    if ($a.StartsWith('RIFF') -and $a.Substring(8, 4) -eq 'WEBP') { return 'webp' }
    if ($a.Substring(4, 4) -eq 'ftyp') { return 'avif' }
    return $null
}

function Baixar-Arquivo([string]$url) {
    $tmp = [IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 25 -UserAgent $UA | Out-Null
        $tam = (Get-Item -LiteralPath $tmp).Length
        if ($tam -lt 2KB -or $tam -gt 15MB) { throw 'tamanho fora do esperado' }
        $tipo = Get-TipoImagem $tmp
        if (-not $tipo) { throw 'nao e imagem' }
        return [pscustomobject]@{ Caminho = $tmp; Tipo = $tipo }
    } catch {
        Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
        return $null
    }
}

function Get-Dimensoes([string]$arquivo) {
    if (-not $script:TemDrawing) { return $null }
    try {
        $img = [System.Drawing.Image]::FromFile($arquivo)
        try { return @($img.Width, $img.Height) } finally { $img.Dispose() }
    } catch { return $null }
}

function Padronizar([string]$origem, [string]$destinoJpg) {
    # quadrado branco, produto centralizado com margem, JPG qualidade 90
    if (-not $script:TemDrawing) { return $false }
    try {
        $img = [System.Drawing.Image]::FromFile($origem)
        try {
            $util = [double]$Tamanho * (1 - 2 * $MARGEM)
            $esc = [Math]::Min($util / $img.Width, $util / $img.Height)
            $w = [int][Math]::Round($img.Width * $esc)
            $h = [int][Math]::Round($img.Height * $esc)
            $tela = New-Object System.Drawing.Bitmap $Tamanho, $Tamanho
            $g = [System.Drawing.Graphics]::FromImage($tela)
            try {
                $g.Clear([System.Drawing.Color]::White)
                $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.DrawImage($img, [int](($Tamanho - $w) / 2), [int](($Tamanho - $h) / 2), $w, $h)
            } finally { $g.Dispose() }
            $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
            $pars = New-Object System.Drawing.Imaging.EncoderParameters 1
            $pars.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]90)
            $tela.Save($destinoJpg, $codec, $pars)
            $tela.Dispose()
            return $true
        } finally { $img.Dispose() }
    } catch { return $false }
}

function Guardar-Foto([string]$ean, [string]$arquivoOrigem, [string]$tipo, [string]$fonte, [bool]$aprovado) {
    # copia o original, padroniza e coloca em banco\ ou revisar\. Retorna (caminho, observacao)
    Copy-Item -LiteralPath $arquivoOrigem -Destination (Join-Path $pOriginais "$ean`_$fonte.$tipo") -Force
    $pasta = if ($aprovado) { $pBanco } else { $pRevisar }
    Get-ChildItem -LiteralPath $pasta -Filter "$ean.*" -ErrorAction SilentlyContinue | Remove-Item -Force
    if ($aprovado) { Get-ChildItem -LiteralPath $pRevisar -Filter "$ean.*" -ErrorAction SilentlyContinue | Remove-Item -Force }
    $destino = Join-Path $pasta "$ean.jpg"
    if ($script:TemDrawing -and (Padronizar $arquivoOrigem $destino)) { return @($destino, '') }
    $destino = Join-Path $pasta "$ean.$tipo"
    Copy-Item -LiteralPath $arquivoOrigem -Destination $destino -Force
    return @($destino, "salva sem padronizar (formato $tipo)")
}

# ---------------------------------------------------------------- fontes
function Novo-Candidato($url, $fonte, $titulo, $nota, $largura = 0, $altura = 0) {
    return [pscustomobject]@{ Url = $url; Fonte = $fonte; Titulo = "$titulo"; Nota = [double]$nota; Largura = [int]$largura; Altura = [int]$altura }
}

function Fonte-Google([string]$ean, [string]$nome) {
    if (-not $SerperKey) { return @() }
    $porNome = $false
    $imgs = @(Buscar-Serper $ean)
    if ($imgs.Count -eq 0 -and $nome) { $imgs = @(Buscar-Serper $nome); $porNome = $true }

    $cands = @()
    foreach ($im in $imgs) {
        if (-not $im.imageUrl) { continue }
        $w = [int]$im.imageWidth; $h = [int]$im.imageHeight
        if ($w -gt 0 -and $h -gt 0) {
            if ([Math]::Min($w, $h) -lt $LADO_MINIMO) { continue }
            if ([Math]::Max($w, $h) / [Math]::Min($w, $h) -gt 3) { continue }
        }
        $titulo = "$($im.title)"
        $site = ("$($im.link) $($im.domain) " + (Get-Dominio $im.imageUrl)).ToLower()
        $nota = 0.25
        if (("$titulo $($im.link)").Contains($ean)) { $nota += 0.25 }
        $nota += 0.35 * (Get-Semelhanca $nome $titulo)
        foreach ($d in $DOMINIOS_BONS) { if ($site.Contains($d)) { $nota += 0.15; break } }
        foreach ($d in $DOMINIOS_RUINS) { if ($site.Contains($d)) { $nota -= 0.50; break } }
        if ($porNome) { $nota = [Math]::Min($nota, $NOTA_APROVAR - 0.01) }  # achou pelo nome, nao pelo EAN: revisar
        $cands += Novo-Candidato $im.imageUrl 'google' $titulo ([Math]::Round($nota, 3)) $w $h
    }
    return @($cands | Sort-Object Nota -Descending | Select-Object -First $MAX_CANDIDATOS)
}

function Buscar-Serper([string]$q) {
    try {
        $corpo = @{ q = $q; gl = 'br'; hl = 'pt-br'; num = 20 } | ConvertTo-Json -Compress
        $r = Invoke-RestMethod -Uri $URL_SERPER -Method Post -TimeoutSec 20 `
            -Headers @{ 'X-API-KEY' = $SerperKey } -ContentType 'application/json; charset=utf-8' `
            -Body ([Text.Encoding]::UTF8.GetBytes($corpo))
        return @($r.images)
    } catch {
        $msg = "$($_.Exception.Message)"
        if ($msg -match '401|403') { Write-Warning "Serper recusou a chave (confira em serper.dev): $msg" }
        return @()
    }
}

function Fonte-Cosmos([string]$ean) {
    if (-not $CosmosToken) { return @() }
    try {
        $j = Invoke-RestMethod -Uri ($URL_COSMOS -f $ean) -TimeoutSec 20 -UserAgent 'Cosmos-API-Request' `
            -Headers @{ 'X-Cosmos-Token' = $CosmosToken }
        if ($j.thumbnail) { return @(Novo-Candidato $j.thumbnail 'cosmos' $j.description 0.90) }
    } catch {}
    return @()
}

function Fonte-OpenFacts([string]$ean, [string]$modelo, [string]$nomeFonte) {
    try {
        $j = Invoke-RestMethod -Uri ($modelo -f $ean) -TimeoutSec 20 -UserAgent $UA
        if ($j.status -eq 1) {
            $url = $j.product.image_front_url
            if (-not $url) { $url = $j.product.image_url }
            if ($url) { return @(Novo-Candidato $url $nomeFonte $j.product.product_name 0.80) }
        }
    } catch {}
    return @()
}

# ---------------------------------------------------------------- processamento
function Nova-Linha([string]$ean, [string]$nome) {
    return [pscustomobject][ordered]@{
        ean = $ean; nome_planilha = $nome; status = ''; fonte = ''; nota = ''
        titulo_encontrado = ''; url_imagem = ''; arquivo = ''; observacao = ''
    }
}

function Processar([string]$ean, [string]$nome) {
    $linha = Nova-Linha $ean $nome
    if (-not (Test-Ean $ean)) {
        $linha.status = 'EAN_INVALIDO'; $linha.observacao = 'tamanho ou digito verificador errado'
        return $linha
    }
    $existe = Get-ChildItem -LiteralPath $pBanco -Filter "$ean.*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existe -and -not $Refazer) { $linha.status = 'JA_EXISTE'; $linha.arquivo = $existe.FullName; return $linha }
    if ($SoManual) { $linha.status = 'FALTANDO'; $linha.observacao = 'busca automatica desligada (-SoManual)'; return $linha }

    $melhor = $null   # @{ Nota; Cand; Arq }
    $motivos = @()
    foreach ($fonte in @('google', 'cosmos', 'openfoodfacts', 'openbeautyfacts')) {
        $cands = switch ($fonte) {
            'google'          { Fonte-Google $ean $nome }
            'cosmos'          { Fonte-Cosmos $ean }
            'openfoodfacts'   { Fonte-OpenFacts $ean $URL_OFF 'openfoodfacts' }
            'openbeautyfacts' { Fonte-OpenFacts $ean $URL_OBF 'openbeautyfacts' }
        }
        foreach ($c in @($cands)) {
            if (-not $c) { continue }
            $arq = Baixar-Arquivo $c.Url
            if (-not $arq) { $motivos += "$($c.Fonte): falha ao baixar"; continue }

            $nota = $c.Nota
            $dim = if ($c.Largura -gt 0) { @($c.Largura, $c.Altura) } elseif ($script:TemDrawing) { Get-Dimensoes $arq.Caminho } else { $null }
            if ($dim) {
                $menor = [Math]::Min($dim[0], $dim[1]); $maior = [Math]::Max($dim[0], $dim[1])
                if ($menor -lt $LADO_MINIMO) { $motivos += "$($c.Fonte): pequena ($($dim[0])x$($dim[1]))"; Remove-Item $arq.Caminho; continue }
                if ($maior / $menor -gt 3) { $motivos += "$($c.Fonte): formato de banner"; Remove-Item $arq.Caminho; continue }
                if ($maior / $menor -gt 2) { $nota -= 0.10 }
            }
            if ($c.Fonte -ne 'google' -and $nome -and $c.Titulo -and (Get-Semelhanca $nome $c.Titulo) -lt 0.2) {
                $nota -= 0.25   # base confiavel, mas o nome nao bate com a planilha
            }
            if (-not $melhor -or $nota -gt $melhor.Nota) {
                if ($melhor) { Remove-Item $melhor.Arq.Caminho -ErrorAction SilentlyContinue }
                $melhor = @{ Nota = $nota; Cand = $c; Arq = $arq }
            } else {
                Remove-Item $arq.Caminho -ErrorAction SilentlyContinue
            }
        }
        if ($melhor -and $melhor.Nota -ge $NOTA_APROVAR) { break }   # ja achou uma boa
    }

    if (-not $melhor) {
        $obs = ($motivos -join '; ')
        if (-not $obs) { $obs = 'nenhuma fonte encontrou' }
        if ($obs.Length -gt 300) { $obs = $obs.Substring(0, 300) }
        $linha.status = 'FALTANDO'; $linha.observacao = $obs
        return $linha
    }

    $obs = @()
    $nota = $melhor.Nota
    $hash = (Get-FileHash -LiteralPath $melhor.Arq.Caminho -Algorithm MD5).Hash
    if (-not $script:Hashes.ContainsKey($hash)) { $script:Hashes[$hash] = @() }
    $outros = @($script:Hashes[$hash] | Where-Object { $_ -ne $ean })
    if ($outros.Count -gt 0) {
        $nota = [Math]::Min($nota, $NOTA_APROVAR - 0.01)   # mesma foto de outro produto: desconfia
        $obs += "mesma foto do EAN $($outros -join ', ')"
    }
    if ($script:Hashes[$hash] -notcontains $ean) { $script:Hashes[$hash] += $ean }

    $aprovado = $nota -ge $NOTA_APROVAR
    $res = Guardar-Foto $ean $melhor.Arq.Caminho $melhor.Arq.Tipo $melhor.Cand.Fonte $aprovado
    Remove-Item -LiteralPath $melhor.Arq.Caminho -ErrorAction SilentlyContinue
    if ($res[1]) { $obs += $res[1] }

    $linha.status = if ($aprovado) { 'OK' } else { 'REVISAR' }
    $linha.fonte = $melhor.Cand.Fonte
    $linha.nota = [Math]::Round($nota, 2)
    $linha.titulo_encontrado = $melhor.Cand.Titulo
    $linha.url_imagem = $melhor.Cand.Url
    $linha.arquivo = $res[0]
    $linha.observacao = ($obs -join '; ')
    return $linha
}

# ---------------------------------------------------------------- modo manual
function Get-PastaDownloads {
    if ($PastaDownloads) { return $PastaDownloads }
    try {
        $p = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'
        if ($p) { return [Environment]::ExpandEnvironmentVariables($p) }
    } catch {}
    if ($env:USERPROFILE) { return (Join-Path $env:USERPROFILE 'Downloads') }
    return (Join-Path $HOME 'Downloads')
}

function Ler-Tecla {
    try {
        if ([Console]::KeyAvailable) { return ([Console]::ReadKey($true)).Key.ToString().ToUpper() }
    } catch {}
    return $null
}

function Modo-Manual($linhas) {
    $pendentes = @($linhas | Where-Object { $_.status -eq 'FALTANDO' })
    if ($pendentes.Count -eq 0) { Write-Host "`nNada faltando para o modo manual."; return }
    $dl = Get-PastaDownloads
    if (-not (Test-Path -LiteralPath $dl)) { New-Item -ItemType Directory -Path $dl | Out-Null }

    Write-Host ""
    Write-Host "==================== MODO MANUAL ($($pendentes.Count) EANs) ====================" -ForegroundColor Cyan
    Write-Host "Para cada EAN vou abrir o Google Imagens no navegador."
    Write-Host "  1. Clique na foto certa para ela abrir grande na lateral"
    Write-Host "  2. Botao direito na foto grande > 'Salvar imagem como...' (pode deixar em Downloads)"
    Write-Host "  3. Eu pego o arquivo, renomeio para EAN.jpg e guardo no banco"
    Write-Host "Teclas: S = pular este EAN   Q = encerrar o modo manual"
    Write-Host "Pasta vigiada: $dl"
    Write-Host ""

    $i = 0
    foreach ($linha in $pendentes) {
        $i++
        $antes = @{}
        Get-ChildItem -LiteralPath $dl -File -ErrorAction SilentlyContinue | ForEach-Object { $antes[$_.FullName] = $_.LastWriteTimeUtc }

        $q = [uri]::EscapeDataString(("$($linha.ean) $($linha.nome_planilha)").Trim())
        try { Start-Process ($URL_GOOGLE_MANUAL -f $q) } catch { Write-Host "  (abra manualmente: $($URL_GOOGLE_MANUAL -f $q))" }
        Write-Host ("[{0}/{1}] {2}  {3}  -> aguardando a foto..." -f $i, $pendentes.Count, $linha.ean, $linha.nome_planilha) -ForegroundColor Yellow

        $inicio = Get-Date; $achou = $null; $parar = $false
        while (((Get-Date) - $inicio).TotalSeconds -lt $EsperaManual) {
            $t = Ler-Tecla
            if ($t -eq 'S') { break }
            if ($t -eq 'Q') { $parar = $true; break }
            $novos = @(Get-ChildItem -LiteralPath $dl -File -ErrorAction SilentlyContinue | Where-Object {
                    $_.Extension -match '^\.(jpe?g|jfif|png|webp|avif|gif|bmp)$' -and
                    (-not $antes.ContainsKey($_.FullName) -or $antes[$_.FullName] -ne $_.LastWriteTimeUtc) })
            if ($novos.Count -gt 0) {
                $f = $novos | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
                Start-Sleep -Milliseconds 800
                $agora = Get-Item -LiteralPath $f.FullName -ErrorAction SilentlyContinue
                if ($agora -and $agora.Length -gt 0 -and $agora.Length -eq $f.Length) { $achou = $agora.FullName; break }
            }
            Start-Sleep -Milliseconds 500
        }
        if ($parar) { Write-Host "Modo manual encerrado."; break }
        if (-not $achou) { Write-Host "  pulado"; continue }

        $tipo = Get-TipoImagem $achou
        if (-not $tipo) { Write-Host "  o arquivo salvo nao e uma imagem, pulei"; continue }
        $res = Guardar-Foto $linha.ean $achou $tipo 'google_manual' $true
        Remove-Item -LiteralPath $achou -ErrorAction SilentlyContinue
        $linha.status = 'OK_MANUAL'; $linha.fonte = 'google_manual'; $linha.nota = 1
        $linha.arquivo = $res[0]; $linha.observacao = $res[1]
        Write-Host "  salvo: $($res[0])" -ForegroundColor Green
    }
}

# ---------------------------------------------------------------- principal
$pBanco = Join-Path $Saida 'banco'
$pRevisar = Join-Path $Saida 'revisar'
$pOriginais = Join-Path $Saida 'originais'
foreach ($p in @($pBanco, $pRevisar, $pOriginais)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
$script:Hashes = @{}   # hash da foto -> EANs que ja usam ela (inclui rodadas anteriores)
Get-ChildItem -LiteralPath $pOriginais -File -ErrorAction SilentlyContinue | ForEach-Object {
    $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm MD5).Hash
    $e = ($_.BaseName -split '_')[0]
    if (-not $script:Hashes.ContainsKey($h)) { $script:Hashes[$h] = @() }
    if ($script:Hashes[$h] -notcontains $e) { $script:Hashes[$h] += $e }
}

$itens = @(Ler-Entrada)
if ($Limite -gt 0) { $itens = @($itens | Select-Object -First $Limite) }

$fontes = @()
if ($SerperKey) { $fontes += 'Google (Serper)' }
if ($CosmosToken) { $fontes += 'Cosmos' }
$fontes += 'Open Food Facts', 'Open Beauty Facts'
if ($Manual -or $SoManual) { $fontes += 'Google manual' }
Write-Host "$($itens.Count) EANs | fontes: $($fontes -join ', ') | saida: $((Resolve-Path $Saida).Path)"
if (-not $SerperKey -and -not $Manual -and -not $SoManual) {
    Write-Warning "Sem chave do Google (Serper): vou usar so as bases abertas. Para buscar no Google, crie a chave gratis em serper.dev (-SerperKey) ou rode com -Manual."
}
if (-not $script:TemDrawing) { Write-Warning "System.Drawing indisponivel: as fotos serao salvas sem padronizar." }
Write-Host ""

$linhas = New-Object Collections.Generic.List[object]
$n = 0
foreach ($it in $itens) {
    $n++
    $l = Processar $it.ean $it.nome
    $linhas.Add($l)
    $cor = switch ($l.status) { 'OK' { 'Green' } 'REVISAR' { 'Yellow' } 'JA_EXISTE' { 'DarkGray' } default { 'Red' } }
    $nomeCurto = if ($it.nome.Length -gt 40) { $it.nome.Substring(0, 40) } else { $it.nome }
    Write-Host ("[{0}/{1}] {2,-14} {3,-12} {4,-16} {5}" -f $n, $itens.Count, $it.ean, $l.status, $l.fonte, $nomeCurto) -ForegroundColor $cor
    if ($l.status -notin 'JA_EXISTE', 'EAN_INVALIDO' -and -not $SoManual) { Start-Sleep -Milliseconds $PAUSA_MS }
}

if ($Manual -or $SoManual) { Modo-Manual $linhas }

$relatorio = Join-Path $Saida 'relatorio_imagens.csv'
$enc = if ($PSVersionTable.PSVersion.Major -ge 6) { 'utf8BOM' } else { 'UTF8' }
$linhas | Export-Csv -LiteralPath $relatorio -Delimiter ';' -NoTypeInformation -Encoding $enc

Write-Host "`nResumo:"
$linhas | Group-Object status | Sort-Object Count -Descending | ForEach-Object { Write-Host ("  {0,-13} {1}" -f $_.Name, $_.Count) }
Write-Host "`nFotos aprovadas: $pBanco"
Write-Host "Para revisar:    $pRevisar"
Write-Host "Relatorio:       $relatorio"
