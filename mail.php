<?php

$Name = Trim(stripslashes($_POST['name'])); 
$Email = Trim(stripslashes($_POST['email'])); 
$Message = Trim(stripslashes($_POST['message'])); 

$EmailFrom = "contacto@adrianmoreno.info"; // 'From' Email
$EmailTo = "zetxek@yahoo.es"; // Your Email (Where the Messages Are Sent)
$Subject = "Mensaje a travŽes de AdrianMoreno.info"; // Email Subject Title

// Validation
$validationOK=true;
if (!$validationOK) {
  exit;
}

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
?>