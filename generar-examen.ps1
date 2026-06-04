param(
    [Parameter(Mandatory = $true)]
    [string]$InputJson,

    [Parameter(Mandatory = $true)]
    [string]$OutputJson,

    [Parameter(Mandatory = $true)]
    [string]$SubjectTitle,

    [Parameter(Mandatory = $true)]
    [string]$ExamTitle,

    [string]$Subtitle = "",
    [string]$Notice = "",
    [double]$MaxScore = 10,
    [double]$WrongAnswersPerDiscountedCorrect = 0,
    [int]$TimeLimitMinutes = 90,
    [string]$FormulaTip = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-SourceQuestions {
    param(
        [Parameter(Mandatory = $true)]
        [object]$SourceRoot
    )

    if ($SourceRoot -is [System.Array]) {
        return ,$SourceRoot
    }

    if ($null -ne $SourceRoot.questions -and $SourceRoot.questions -is [System.Array]) {
        return ,$SourceRoot.questions
    }

    throw "Formato de entrada no soportado. Debe ser un array de preguntas o un objeto con la propiedad 'questions'."
}

function Get-QuestionText {
    param([Parameter(Mandatory = $true)][object]$Question)

    if ($null -ne $Question.pregunta -and [string]::IsNullOrWhiteSpace([string]$Question.pregunta) -eq $false) {
        return [string]$Question.pregunta
    }

    if ($null -ne $Question.text -and [string]::IsNullOrWhiteSpace([string]$Question.text) -eq $false) {
        return [string]$Question.text
    }

    return ""
}

function Get-QuestionExplanation {
    param([Parameter(Mandatory = $true)][object]$Question)

    if ($null -ne $Question.explicacion) {
        return [string]$Question.explicacion
    }

    if ($null -ne $Question.explanation) {
        return [string]$Question.explanation
    }

    return ""
}

function Get-QuestionCorrectOption {
    param([Parameter(Mandatory = $true)][object]$Question)

    if ($null -ne $Question.correcta) {
        return ([string]$Question.correcta).Trim().ToUpperInvariant()
    }

    if ($null -ne $Question.correctOption) {
        return ([string]$Question.correctOption).Trim().ToUpperInvariant()
    }

    return ""
}

function Convert-Options {
    param([Parameter(Mandatory = $true)][object]$Question)

    if ($null -ne $Question.opciones) {
        $props = $Question.opciones.PSObject.Properties | Sort-Object Name
        $result = @()
        foreach ($prop in $props) {
            $result += [ordered]@{
                key  = ([string]$prop.Name).Trim().ToUpperInvariant()
                text = [string]$prop.Value
            }
        }
        return ,$result
    }

    if ($null -ne $Question.options -and $Question.options -is [System.Array]) {
        $result = @()
        $idx = 0
        foreach ($opt in $Question.options) {
            $fallback = [char](65 + $idx)
            $key = if ($null -ne $opt.key -and [string]::IsNullOrWhiteSpace([string]$opt.key) -eq $false) {
                ([string]$opt.key).Trim().ToUpperInvariant()
            } else {
                [string]$fallback
            }
            $result += [ordered]@{
                key  = $key
                text = [string]$opt.text
            }
            $idx++
        }
        return ,$result
    }

    return @()
}

function Get-DefaultFormulaTip {
    param(
        [double]$Penalty,
        [int]$QuestionCount,
        [double]$FinalMaxScore
    )

    if ($QuestionCount -le 0) {
        return ""
    }

    if ($Penalty -gt 0) {
        return "[(A - E / $Penalty) / $QuestionCount] x $FinalMaxScore"
    }

    return "[(A) / $QuestionCount] x $FinalMaxScore"
}

$inputPath = Resolve-Path -Path $InputJson
$inputRaw = Get-Content -Path $inputPath -Raw -Encoding UTF8
$inputObj = $inputRaw | ConvertFrom-Json

$sourceQuestions = Get-SourceQuestions -SourceRoot $inputObj

$convertedQuestions = @()
$position = 1

foreach ($q in $sourceQuestions) {
    $idValue = if ($null -ne $q.id) { [int]$q.id } else { $position }
    $textValue = Get-QuestionText -Question $q
    $optionsValue = Convert-Options -Question $q
    $correctValue = Get-QuestionCorrectOption -Question $q
    $explanationValue = Get-QuestionExplanation -Question $q

    if ([string]::IsNullOrWhiteSpace($textValue)) {
        throw "La pregunta con id '$idValue' no tiene texto (pregunta/text)."
    }

    if ($optionsValue.Count -lt 2) {
        throw "La pregunta con id '$idValue' debe tener al menos 2 opciones."
    }

    $optionKeys = @($optionsValue | ForEach-Object { $_.key })
    if ($correctValue -ne "" -and ($optionKeys -notcontains $correctValue)) {
        throw "La pregunta con id '$idValue' tiene una opción correcta '$correctValue' que no existe en sus opciones."
    }

    $convertedQuestions += [ordered]@{
        id            = $idValue
        text          = $textValue
        options       = $optionsValue
        correctOption = $correctValue
        explanation   = $explanationValue
    }

    $position++
}

$questionCount = $convertedQuestions.Count
$finalFormula = if ([string]::IsNullOrWhiteSpace($FormulaTip)) {
    Get-DefaultFormulaTip -Penalty $WrongAnswersPerDiscountedCorrect -QuestionCount $questionCount -FinalMaxScore $MaxScore
} else {
    $FormulaTip
}

$target = [ordered]@{
    subjectTitle   = $SubjectTitle
    examTitle      = $ExamTitle
    subtitle       = $Subtitle
    totalQuestions = $questionCount
    notice         = $Notice
    scoring        = [ordered]@{
        maxScore                         = $MaxScore
        wrongAnswersPerDiscountedCorrect = $WrongAnswersPerDiscountedCorrect
        formulaTip                       = $finalFormula
        timeLimitMinutes                 = $TimeLimitMinutes
    }
    questions      = $convertedQuestions
}

$outputDir = Split-Path -Path $OutputJson -Parent
if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$jsonOutput = $target | ConvertTo-Json -Depth 100
Set-Content -Path $OutputJson -Value $jsonOutput -Encoding UTF8

Write-Output "Examen generado correctamente en: $OutputJson"
Write-Output "Preguntas convertidas: $questionCount"