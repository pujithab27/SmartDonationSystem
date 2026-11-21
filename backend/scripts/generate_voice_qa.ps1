# Generate only public, synthetic test sentences. Never capture the microphone.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$voiceProjectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$voiceCases = Get-Content -LiteralPath (Join-Path $voiceProjectRoot 'frontend\tests\fixtures\donation-voice-cases.json') -Raw | ConvertFrom-Json
$voiceOutput = Join-Path $voiceProjectRoot 'output\qa-private\voice-cases'
New-Item -ItemType Directory -Path $voiceOutput -Force | Out-Null
foreach ($voiceCase in $voiceCases) {
    $voiceSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
    try {
        $voiceSpeaker.Rate = 1
        $voiceSpeaker.SetOutputToWaveFile((Join-Path $voiceOutput ($voiceCase.id + '.wav')))
        $voiceSpeaker.Speak($voiceCase.sentence)
    } finally {
        $voiceSpeaker.Dispose()
    }
    Write-Output ('Generated synthetic audio: ' + $voiceCase.id)
}
