function waitForElement(elementPath, callBack){
    if (document.querySelector(elementPath) != null){
        callBack(elementPath, document.querySelector(elementPath));
    } else {
        setTimeout(function(){
            waitForElement(elementPath, callBack);
        }, 50);
    }
}
waitForElement("#footer", function(){
    var currentYear = new Date().getFullYear();
    document.getElementById("footer").innerHTML = "[copyright &copy" + currentYear + " x70.dev - all rights reserved | <a id='disclaimerLink'>disclaimer</a> | <a id='gitHubLink'>source</a>]";

    var gitHubLink = document.getElementById("gitHubLink");
    gitHubLink.onclick = function() {
        window.open("https://github.com/zroulston/x70.dev", "_blank");
    };
    
    var modal = document.getElementById("disclaimerModal");
    var link = document.getElementById("disclaimerLink");
    var span = document.getElementsByClassName("close")[0];
       link.onclick = function() {
      modal.style.display = "block";
      return false;
    }
    
    span.onclick = function() {
      modal.style.display = "none";
    }
    
    window.onclick = function(event) {
      if (event.target == modal) {
        modal.style.display = "none";
      }
  }    
});
