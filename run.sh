#!/bin/bash

# TODO if destination url does not exist, maybe we should create it

# curl adding is done with --ftp-create-dirs -T "$file_name"
# curl removing is done with -Q "-DELE $file_name"
# src: http://curl.haxx.se/mail/archive-2009-01/0040.html
# these commands return an error if they fail

# confirm environment variables
if [ ! -n "$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_DESTINATION" ]
then
    fail "missing option \"destination\", aborting"
fi
if [ ! -n "$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_USERNAME" ]
then
    fail "missing option \"username\", aborting"
fi
if [ ! -n "$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_PASSWORD" ]
then
    fail "missing option \"password\", aborting"
fi

DESTINATION=$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_DESTINATION
USERNAME=$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_USERNAME
PASSWORD=$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_PASSWORD
REMOTE_FILE=$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_REMOTE_FILE
EXCLUDES=$WERCKER_FTP_DEPLOY_EXCLUDE_EXCLUDE_VERBOSE_FILE
RETRY=${WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_RETRY:-3}

if [ ! -n "$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_REMOTE_FILE" ]
then
    debug "missing option \"remote-file\" so we will use remote.txt"
    REMOTE_FILE=remote.txt
fi

command_exists () {
  type "$1" &> /dev/null ;
}

# this is only for running this script on OS X
if command_exists md5sum ; then
  echo "md5sum \"\$1\"" > $WERCKER_CACHE_DIR/md5sum.sh
else
  echo "md5 -r \"\$1\" | sed -e 's#\([^ ]*\) \(.*\)\$#\1  \2#'" > $WERCKER_CACHE_DIR/md5sum.sh
fi
chmod +x $WERCKER_CACHE_DIR/md5sum.sh

# getting together necessary dependencies and directories
debug "INIT: checking existance of dependencies and directories"
if ! ( command_exists curl ); then
  debug " - curl does not exist. Trying to apt-get ..."
  if command_exists apt-get; then
    apt-get install -y curl
  fi
  if ! ( command_exists curl ); then
    debug " - failed installing curl - aborting ..."
    exit 1
  fi
fi

CURL=curl
if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_SIMULATION+x} ]; then
  debug "Simulation run, no changes to the server will be made!"
  CURL="echo SIM: curl"
fi

# args: file
remove_empty_lines () {
  tmp=$WERCKER_CACHE_DIR/empty_lines_tmp.txt
  mv $1 $tmp
  grep -v '^$' $tmp > $1
  rm $tmp
}

# args: file, filename
remove_matching_files () {
  tmp=$WERCKER_CACHE_DIR/matching_lines_tmp.txt
  mv $1 $tmp
  grep -v "[[:space:]]$2\$" $tmp > $1
  rm $tmp
}

# args: file1, file2, out
find_differences () {
  diff --ignore-case -b --ignore-blank-lines  --old-line-format='' --new-line-format=$'%l\n' --unchanged-line-format='' $1 $2 | tee $3 > /dev/null
  remove_empty_lines $3
  wc -l < $3
}

# args: file, destination
upload_file () {
  # echo "'$1' -> '$2'"
  $CURL -u $USERNAME:$PASSWORD --ftp-create-dirs -T "$1" "$2" --retry $RETRY || fail "failed to push '$1' Please try again"
}

# args: file, destination
delete_file () {
  # echo "'$1' -> '$2'"
  $CURL -u $USERNAME:$PASSWORD -Q "-DELE $1" "$2/" > /dev/null --retry $RETRY || fail "'$1' does not exists on server. Please make sure your $REMOTE_FILE is synchronized."
}

update_remote_txt () {
  # echo "'$1' -> '$2'"
  $CURL -u $USERNAME:$PASSWORD --ftp-create-dirs -T "$WERCKER_CACHE_DIR/remote.txt" "$DESTINATION/$REMOTE_FILE" --retry $RETRY || fail "failed to push $REMOTE_FILE. It is not in sync anymore. Please remove all files from $DESTINATION and start again"
}

# args: EXCLUDES, file_to_exclude
exclude () {
  tmp=$WERCKER_CACHE_DIR/exclude_tmp.txt
  (
    for exclude in $1;
    do
      # echo -- Excluding path: $exclude
      mv "$2" "$tmp"
      grep -v "$exclude" "$tmp" > "$2" || true
    done
  )
  rm "$tmp" || true
}

# since wercker in beta allows max 60 minutes per build (see http://devcenter.wercker.com/docs/faq/how-to-bypass-timeouts.html)
# upload of large number of files can be separated
TIMEOUT=60
date_start=$(date +"%s")
if [  -n "$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_TIMEOUT" ]
then
    TIMEOUT=$WERCKER_FTP_DEPLOY_EXCLUDE_VERBOSE_TIMEOUT
fi
debug "TIMEOUT is set to $TIMEOUT min. After that you should run this script again to complete all files. If wercker stops this script before TIMEOUT then it may happen that $REMOTE_FILE is not uploaded, so use short TIMEOUT (less than 25min). See http://devcenter.wercker.com/docs/faq/how-to-bypass-timeouts.html to increase that to 60min!"



debug "Test connection and list $DESTINATION files"
debug "curl -u $USERNAME:do_not_show_PASSWORD_in_log $DESTINATION/"
curl -u $USERNAME:$PASSWORD $DESTINATION/

debug "Calculating md5sum for local files"
find . -type f -exec $WERCKER_CACHE_DIR/md5sum.sh "{}" > $WERCKER_CACHE_DIR/local.txt \;
sort -k 2 -u $WERCKER_CACHE_DIR/local.txt -o $WERCKER_CACHE_DIR/local.txt > /dev/null

debug "Look for $DESTINATION/$REMOTE_FILE"
curl -u $USERNAME:$PASSWORD  $DESTINATION/$REMOTE_FILE -o $WERCKER_CACHE_DIR/remote.txt || (debug "No $REMOTE_FILE file" && echo "" > $WERCKER_CACHE_DIR/remote.txt )
sort -k 2 -u $WERCKER_CACHE_DIR/remote.txt -o $WERCKER_CACHE_DIR/remote.txt > /dev/null

debug "Find files that are new"
cut -d' ' -f3- $WERCKER_CACHE_DIR/remote.txt > $WERCKER_CACHE_DIR/remote_files.txt
cut -d' ' -f3- $WERCKER_CACHE_DIR/local.txt > $WERCKER_CACHE_DIR/local_files.txt
find_differences $WERCKER_CACHE_DIR/remote_files.txt $WERCKER_CACHE_DIR/local_files.txt $WERCKER_CACHE_DIR/new.txt

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "New files (before exclusion)"
    cat $WERCKER_CACHE_DIR/new.txt
fi

debug "Find removed files"
find_differences $WERCKER_CACHE_DIR/local_files.txt $WERCKER_CACHE_DIR/remote_files.txt $WERCKER_CACHE_DIR/removed.txt

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "Removed files (before exclusion)"
    cat $WERCKER_CACHE_DIR/removed.txt
fi

debug "Find changed files"
grep -v -f $WERCKER_CACHE_DIR/new.txt $WERCKER_CACHE_DIR/local.txt | tee $WERCKER_CACHE_DIR/same_local.txt > /dev/null
grep -v -f $WERCKER_CACHE_DIR/removed.txt $WERCKER_CACHE_DIR/remote.txt | tee $WERCKER_CACHE_DIR/same_remote.txt > /dev/null
find_differences $WERCKER_CACHE_DIR/same_remote.txt $WERCKER_CACHE_DIR/same_local.txt $WERCKER_CACHE_DIR/changed.txt
cat $WERCKER_CACHE_DIR/changed.txt | awk '{print $2}' | tee $WERCKER_CACHE_DIR/changed.txt > /dev/null

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "Modified files (before exclusion)"
    cat $WERCKER_CACHE_DIR/changed.txt
fi

debug "Exclude-sequence: $EXCLUDES"
debug "Apply excludes to new files (if any)"
exclude "$EXCLUDES" "$WERCKER_CACHE_DIR/new.txt"

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "New files (after exclusion)"
    cat $WERCKER_CACHE_DIR/new.txt
fi

debug "Apply excludes to changed files (if any)"
exclude "$EXCLUDES" "$WERCKER_CACHE_DIR/changed.txt"

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "Modified files (after exclusion)"
    cat $WERCKER_CACHE_DIR/changed.txt
fi

debug "Apply excludes to removed files (if any)"
exclude "$EXCLUDES" "$WERCKER_CACHE_DIR/removed.txt"

if [ ! -z ${WERCKER_FTP_DEPLOY_VERBOSE_VERBOSE+x} ]; then
    debug "Removed files (after exclusion)"
    cat $WERCKER_CACHE_DIR/removed.txt
fi

debug "New: $(wc -l < "$WERCKER_CACHE_DIR/new.txt")"
debug "Upd: $(wc -l < "$WERCKER_CACHE_DIR/changed.txt")"
debug "Del: $(wc -l < "$WERCKER_CACHE_DIR/removed.txt")"

debug "Start uploading new files"
while read file_name; do
  if [ !  -n "$file_name" ];
  then
    fail "$file_name should exists"
  else
    debug $file_name
    upload_file "$file_name" "$DESTINATION/$file_name"
    $WERCKER_CACHE_DIR/md5sum.sh "$file_name" >> $WERCKER_CACHE_DIR/remote.txt
    update_remote_txt
  fi
  if [ "$TIMEOUT" -le $(( ($(date +"%s") - $date_start) / 60 )) ];
  then
    fail "TIMEOUT $TIMEOUT min has expired. Please run again this script to finish all your files."
  fi
done < $WERCKER_CACHE_DIR/new.txt

debug "Start uploading changed files"
while read file_name; do
  if [ !  -n "$file_name" ];
  then
    fail "$file_name should exists"
  else
    debug $file_name
    upload_file "$file_name" "$DESTINATION/$file_name"
    remove_matching_files $WERCKER_CACHE_DIR/remote.txt "$file_name"
    $WERCKER_CACHE_DIR/md5sum.sh "$file_name" >> $WERCKER_CACHE_DIR/remote.txt
    update_remote_txt
  fi
  if [ "$TIMEOUT" -le $(( ($(date +"%s") - $date_start) / 60 )) ];
  then
    fail "TIMEOUT $TIMEOUT min has expired. Please run again this script to finish all your files."
  fi
done < $WERCKER_CACHE_DIR/changed.txt

debug "Start removing files"
while read file_name; do
  debug $file_name
  # always delete from remote file. Better having one file too much on the server than aborting bc of non-existing file.
  remove_matching_files $WERCKER_CACHE_DIR/remote.txt "$file_name"
  delete_file "$file_name" "$DESTINATION"
  update_remote_txt
done < $WERCKER_CACHE_DIR/removed.txt

success "Done."