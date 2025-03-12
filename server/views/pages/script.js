// xhr call vs ajax call to ipinfo.io/json

// xhr call
var xhr = new XMLHttpRequest();
xhr.open('GET', 'https://ipinfo.io/json', true);
xhr.send();
xhr.onreadystatechange = function() {
    if (xhr.readyState == 4 && xhr.status == 200) {
        var data = JSON.parse(xhr.responseText);
        console.log(data);
    }
}

// ajax call
$.ajax({
    url: 'https://ipinfo.io/json',
    type: 'GET',
    success: function(data) {
        console.log(data);
    }
});

