<?php

$Name = Trim(stripslashes($_POST['name']));
$Email = Trim(stripslashes($_POST['email']));
$Message = Trim(stripslashes($_POST['message']));

$EmailFrom = "contacto@adrianmoreno.info"; // 'From' Email
$EmailTo = "zetxek@gmail.com"; // Your Email (Where the Messages Are Sent)
$Subject = "Message from adrianmoreno.info"; // Email Subject Title

// Validation
$validationOK=false;

$captcha = Trim(stripslashes($_POST['g-recaptcha-response']));


########## ---- CAPTCHA
$post_data = http_build_query(
    array(
        'secret' => '---getyourownsecret!----',
        'response' => $_POST['g-recaptcha-response'],
        'remoteip' => $_SERVER['REMOTE_ADDR']
    )
);
$opts = array('http' =>
    array(
        'method'  => 'POST',
        'header'  => 'Content-type: application/x-www-form-urlencoded',
        'content' => $post_data
    )
);
$context  = stream_context_create($opts);
$response = file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $context);
$result = json_decode($response);
if (!$result->success) {
    die('Oh! CAPTCHA verification failed. Please email me directly at: zetxek at gmail dot com');
}
########## ---- CAPTCHA


// Setup the Body of the Email
$Body = "";
$Body .= "Nombre: ";
$Body .= $Name;
$Body .= "\n";
$Body .= "Email: ";
$Body .= $Email;
$Body .= "\n";
$Body .= "Mensaje: ";
$Body .= $Message;
$Body .= "\n";

// Send Email
$success = mail($EmailTo, $Subject, $Body, "From: <$EmailFrom>");
header("Location: index.php?success=true");
die();
?>
