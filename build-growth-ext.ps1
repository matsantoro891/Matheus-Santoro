# Generates growth-reference-ext.js with CDC BMI and WHO head circumference LMS data.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$csvPath = Join-Path $root 'bmiagerev.csv'
if (-not (Test-Path $csvPath)) {
  Invoke-WebRequest -Uri 'https://www.cdc.gov/growthcharts/data/zscore/bmiagerev.csv' -OutFile $csvPath -UseBasicParsing
}

function ConvertTo-LmsSeries {
  param([array]$Rows)
  $sorted = $Rows | Sort-Object { [double]$_.Agemos }
  $values = @()
  foreach ($row in $sorted) {
    $values += ,@([double]$row.L, [double]$row.M, [double]$row.S)
  }
  return @{
    start = [math]::Floor([double]($sorted | Select-Object -First 1).Agemos)
    values = $values
  }
}

function Interpolate-MonthlyLms {
  param([hashtable]$Anchors)
  $months = @()
  for ($m = 0; $m -le 60; $m++) {
    $keys = $Anchors.Keys | Sort-Object
    $lower = 0
    foreach ($k in $keys) { if ($k -le $m) { $lower = $k } }
    $upper = ($keys | Where-Object { $_ -ge $m } | Sort-Object | Select-Object -First 1)
    if ($null -eq $upper) { $upper = $lower }
    if ($lower -eq $upper) {
      $months += ,$Anchors[$lower]
    } else {
      $frac = ($m - $lower) / ($upper - $lower)
      $a = $Anchors[$lower]; $b = $Anchors[$upper]
      $months += ,@(
        ($a[0] + ($b[0] - $a[0]) * $frac),
        ($a[1] + ($b[1] - $a[1]) * $frac),
        ($a[2] + ($b[2] - $a[2]) * $frac)
      )
    }
  }
  return $months
}

function Expand-MonthlyToDaily {
  param([array]$Monthly)
  $daily = New-Object System.Collections.Generic.List[object]
  for ($day = 0; $day -le 1856; $day++) {
    $monthFloat = $day / 30.4375
    $month = [math]::Floor($monthFloat)
    if ($month -ge 60) {
      $daily.Add($Monthly[60])
      continue
    }
    $frac = $monthFloat - $month
    $a = $Monthly[$month]
    $b = $Monthly[$month + 1]
    $daily.Add(@(
      ($a[0] + ($b[0] - $a[0]) * $frac),
      ($a[1] + ($b[1] - $a[1]) * $frac),
      ($a[2] + ($b[2] - $a[2]) * $frac)
    ))
  }
  return $daily
}

$boysAnchors = @{
  0  = @(1, 34.4618, 0.03686)
  6  = @(1, 43.3306, 0.027019)
  12 = @(1, 46.0661, 0.024663)
  18 = @(1, 47.3759, 0.023352)
  24 = @(1, 48.2832, 0.022553)
  36 = @(1, 49.5435, 0.021382)
  48 = @(1, 50.2457, 0.020678)
  60 = @(1, 50.7487, 0.020114)
}
$girlsAnchors = @{
  0  = @(1, 33.8787, 0.03496)
  6  = @(1, 42.1644, 0.02753)
  12 = @(1, 45.9046, 0.02581)
  18 = @(1, 47.2285, 0.02489)
  24 = @(1, 47.6683, 0.02440)
  36 = @(1, 48.7892, 0.020912)
  48 = @(1, 49.4561, 0.020145)
  60 = @(1, 49.8889, 0.019677)
}

$boysDaily = Expand-MonthlyToDaily (Interpolate-MonthlyLms $boysAnchors)
$girlsDaily = Expand-MonthlyToDaily (Interpolate-MonthlyLms $girlsAnchors)

$csv = Import-Csv $csvPath
$maleBmi = ConvertTo-LmsSeries ($csv | Where-Object Sex -eq '1')
$femaleBmi = ConvertTo-LmsSeries ($csv | Where-Object Sex -eq '2')

function Format-LmsValues {
  param($List)
  $parts = @()
  foreach ($item in $List) {
    $triplet = ($item | ForEach-Object { [math]::Round($_, 6).ToString([System.Globalization.CultureInfo]::InvariantCulture) }) -join ','
    $parts += "[$triplet]"
  }
  return ($parts -join ',')
}

$out = @"
window.GROWTH_REFERENCE_EXT = {
  headCircumference: {
    male: { under5: { start: 0, values: [$(Format-LmsValues $boysDaily)] } },
    female: { under5: { start: 0, values: [$(Format-LmsValues $girlsDaily)] } }
  },
  bmi: {
    male: { start: $($maleBmi.start), values: [$(Format-LmsValues $maleBmi.values)] },
    female: { start: $($femaleBmi.start), values: [$(Format-LmsValues $femaleBmi.values)] }
  }
};
"@

$outPath = Join-Path $root 'growth-reference-ext.js'
[System.IO.File]::WriteAllText($outPath, $out, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $outPath ($((Get-Item $outPath).Length) bytes)"
