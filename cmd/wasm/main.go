package main

import (
	"fmt"
	"strings"
	"syscall/js"
	"time"
)

var (
	now         = time.Now()
	currentYear = now.Format("2006")
)

func GetDisclamier() js.Func {
	sb := strings.Builder{}
	sb.WriteString("<div class=\"modal-content\">")
	sb.WriteString("<span id=\"span\" class=\"close\">&times;</span>")
	sb.WriteString("<h2>Disclaimer</h2>")
	sb.WriteString("<p>")
	sb.WriteString("  The information contained on x70.dev website (the \"Service\") is for general information purposes only. x70.dev assumes no responsibility for errors or omissions in the contents of the Service.")
	sb.WriteString("</p>")
	sb.WriteString("<p>")
	sb.WriteString("  In no event shall x70.dev be liable for any special, direct, indirect, consequential, or incidental damages or any damages whatsoever, whether in an action of contract, negligence or other tort, arising out of or in connection with the use of the Service or the contents of the Service. x70.dev reserves the right to make additions, deletions, or modification to the contents on the Service at any time without prior notice.")
	sb.WriteString("</p>")
	sb.WriteString("<p>")
	sb.WriteString("  This website may contain links to external websites that are not provided or maintained by or in any way affiliated with x70.dev. Please note that x70.dev does not guarantee the accuracy, relevance, timeliness, or completeness of any information on these external websites.")
	sb.WriteString("</p>")
	sb.WriteString("<p>")
	sb.WriteString("  Please be aware that x70.dev is not responsible for the privacy practices of such other sites. We encourage our users to be aware when they leave our site and to read the privacy statements of each and every website that collects personally identifiable information.")
	sb.WriteString("</p>")
	sb.WriteString("<p>")
	sb.WriteString("  The Service is provided on an \"as is\" basis without any warranties of any kind. x70.dev makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.")
	sb.WriteString("</p>")
	sb.WriteString("<p>")
	sb.WriteString("  By using this website, you agree to the above disclaimer. If you do not agree with the above disclaimer, please do not use the Service.")
	sb.WriteString("</p>")
	sb.WriteString("</div>")
	disclaimer := sb.String()
	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return disclaimer
	})
}

func GetFooter() js.Func {
	sb := strings.Builder{}
	sb.WriteString("[copyright &copy")
	sb.WriteString(currentYear)
	sb.WriteString(" x70.dev - all rights reserved | <a id='disclaimerLink'>disclaimer</a> | <a id='gitHubLink'>source</a>]")
	footer := sb.String()

	return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return footer
	})
}

func main() {
	ch := make(chan struct{}, 0)
	fmt.Println("go wasm library loaded")

	js.Global().Set("getFooter", GetFooter())
	js.Global().Set("getDisclaimer", GetDisclamier())
	<-ch
}
